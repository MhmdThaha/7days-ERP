/**
 * Firestore Commit Layer for Product imports.
 *
 * Takes an ImportRunReport (already parsed, mapped, normalized, and
 * validated) and writes the importable rows to Firestore in batches.
 * Performs NO parsing, mapping, normalization, or validation of its own:
 * a row's status decides everything — valid/warning rows are written,
 * error rows are skipped.
 *
 * Reuses the existing ProductDocument schema (product.repository.ts) and
 * the project money convention (money.ts: integer paise). Fields the
 * Product model does not have yet (gstRate, minimumStock) are validated
 * during import but intentionally NOT persisted; they can be committed
 * once the Product model grows those fields.
 *
 * Failure isolation: one failed Firestore batch never crashes the run —
 * its rows are marked failed with a structured CommitError and the
 * remaining batches still commit.
 */

import { Timestamp, type Firestore } from 'firebase-admin/firestore';

import {
  DEFAULT_PRODUCT_CATEGORIES,
  DEFAULT_PRODUCT_UNIT,
} from '@/lib/domain/constants/product';
import type { NormalizedValue } from '@/lib/import/engine/types';
import type { ImportRunReport } from '@/lib/import/services/import.service';
import type { ProductDocument } from '@/lib/repositories/product.repository';

/** Firestore allows 500 writes per batch; stay comfortably below. */
const DEFAULT_BATCH_SIZE = 400;

const FALLBACK_CATEGORY: (typeof DEFAULT_PRODUCT_CATEGORIES)[number] = 'Other';

export type CommitOptions = {
  /** Organization whose products subcollection receives the documents. */
  orgId: string;
  /** User recorded in the audit fields (createdBy / updatedBy). */
  userId: string;
  /** Writes per Firestore batch; exposed for tests. Max 500. */
  batchSize?: number;
};

export type CommitRowStatus = 'imported' | 'skipped' | 'failed';

export type CommitRowResult = {
  /** Original spreadsheet row number. */
  rowNumber: number;
  status: CommitRowStatus;
  /** Firestore document id, present when status is "imported". */
  documentId?: string;
  /** Why the row was skipped or failed. */
  reason?: string;
};

/** One Firestore batch that failed to commit. */
export type CommitError = {
  batchIndex: number;
  /** Spreadsheet row numbers that were in the failed batch. */
  rowNumbers: readonly number[];
  message: string;
};

export type CommitResult = {
  importedCount: number;
  skippedCount: number;
  failedCount: number;
  documentIds: readonly string[];
  rowResults: readonly CommitRowResult[];
  commitErrors: readonly CommitError[];
};

/**
 * Writes the importable rows of a product import run to Firestore.
 *
 * @throws Error only for programmer mistakes (non-product report, invalid
 *         batch size). Firestore failures never throw — they are returned
 *         as commitErrors / failed rows.
 */
export async function commitProductImport(
  db: Firestore,
  report: ImportRunReport,
  options: CommitOptions,
): Promise<CommitResult> {
  if (report.entityType !== 'product') {
    throw new Error(
      `commitProductImport received an "${report.entityType}" report; it only commits products.`,
    );
  }

  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

  if (batchSize < 1 || batchSize > 500) {
    throw new Error(`batchSize must be between 1 and 500, got ${batchSize}.`);
  }

  const collection = db
    .collection('organizations')
    .doc(options.orgId)
    .collection('products');

  const rowResults: CommitRowResult[] = [];
  const documentIds: string[] = [];
  const commitErrors: CommitError[] = [];

  // Split rows once: error rows are skipped, everything else is written.
  const importable = report.result.rows.filter((row) => row.status !== 'error');

  for (const row of report.result.rows) {
    if (row.status === 'error') {
      rowResults.push({
        rowNumber: row.rowNumber,
        status: 'skipped',
        reason: 'Row has validation errors.',
      });
    }
  }

  for (let start = 0; start < importable.length; start += batchSize) {
    const chunk = importable.slice(start, start + batchSize);
    const batchIndex = Math.floor(start / batchSize);
    const batch = db.batch();

    const pending = chunk.map((row) => {
      const docRef = collection.doc();
      batch.set(docRef, buildProductDocument(row.values, options));

      return { rowNumber: row.rowNumber, documentId: docRef.id };
    });

    try {
      await batch.commit();

      for (const entry of pending) {
        documentIds.push(entry.documentId);
        rowResults.push({
          rowNumber: entry.rowNumber,
          status: 'imported',
          documentId: entry.documentId,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      commitErrors.push({
        batchIndex,
        rowNumbers: pending.map((entry) => entry.rowNumber),
        message,
      });

      for (const entry of pending) {
        rowResults.push({
          rowNumber: entry.rowNumber,
          status: 'failed',
          reason: message,
        });
      }
    }
  }

  // Report results in original spreadsheet order regardless of batch order.
  rowResults.sort((a, b) => a.rowNumber - b.rowNumber);

  return {
    importedCount: documentIds.length,
    skippedCount: rowResults.filter((row) => row.status === 'skipped').length,
    failedCount: rowResults.filter((row) => row.status === 'failed').length,
    documentIds,
    rowResults,
    commitErrors,
  };
}

// ---------------------------------------------------------------------------
// Document construction (mirrors productRepository.create defaults)
// ---------------------------------------------------------------------------

/**
 * Rupees (engine output, major units) → integer paise (stored units).
 * Same convention as parseMoneyInput in lib/utils/money.ts, which takes
 * user-typed text; this takes the already-numeric engine value.
 */
function toMinorUnits(major: number): number {
  return Math.round(major * 100);
}

function asString(value: NormalizedValue | undefined): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function asNumber(value: NormalizedValue | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function buildProductDocument(
  values: Readonly<Record<string, NormalizedValue>>,
  options: CommitOptions,
): ProductDocument {
  const now = Timestamp.now();

  const sellingPrice = asNumber(values['sellingPrice']);
  const costPrice = asNumber(values['costPrice']);
  const openingStock = asNumber(values['openingStock']);

  return {
    organizationId: options.orgId,
    // Same normalization as productRepository.create: trimmed, uppercased.
    code: asString(values['code'])?.trim().toUpperCase() ?? '',
    name: asString(values['name'])?.trim() ?? '',
    category: asString(values['category']) ?? FALLBACK_CATEGORY,
    unit: asString(values['unit']) ?? DEFAULT_PRODUCT_UNIT,
    sellingPrice: sellingPrice === null ? 0 : toMinorUnits(sellingPrice),
    description: null,
    isActive: true,
    currentStock: openingStock ?? 0,
    averageCost: costPrice === null ? 0 : toMinorUnits(costPrice),
    activeRecipeId: null,
    imageUrl: null,
    createdAt: now,
    createdBy: options.userId,
    updatedAt: now,
    updatedBy: options.userId,
    deletedAt: null,
    deletedBy: null,
  };
}
