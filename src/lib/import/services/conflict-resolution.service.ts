/**
 * Product Import Conflict Resolution & Commit.
 *
 * Turns a ConflictDetectionResult + user strategy into creates and
 * updates without modifying the conflict detector or commitProductImport.
 *
 * Strategies:
 *   new-only         — commit only cleanRows (skip duplicates + existing)
 *   update-existing  — create new names, update existing (once each),
 *                      skip extra duplicate rows in the file
 */

import { Timestamp, type Firestore } from 'firebase-admin/firestore';

import {
  DEFAULT_PRODUCT_CATEGORIES,
  DEFAULT_PRODUCT_UNIT,
} from '@/lib/domain/constants/product';
import type { NormalizedValue, ValidatedRow } from '@/lib/import/engine/types';
import {
  commitProductImport,
  type CommitError,
  type CommitOptions,
  type CommitResult,
  type CommitRowResult,
} from '@/lib/import/services/commit.service';
import {
  loadProductNameIndex,
  normalizeProductName,
  SKIP_CONFLICTING_DUPLICATE_REASON,
  SKIP_DUPLICATE_PRODUCT_CODE_REASON,
  SKIP_EXACT_DUPLICATE_REASON,
  SKIP_EXISTING_PRODUCT_REASON,
  type ConflictDetectionResult,
  type ProductNameIndex,
} from '@/lib/import/services/conflict.service';
import type { ImportRunReport } from '@/lib/import/services/import.service';
import type { ProductDocument } from '@/lib/repositories/product.repository';

export type ImportResolutionStrategy = 'new-only' | 'update-existing';

export type ResolvedCommitResult = CommitResult & {
  /** Products updated in Firestore (update-existing strategy only). */
  updatedCount: number;
  updatedDocumentIds: readonly string[];
  /** Rows skipped because the product already exists (new-only strategy). */
  skippedExistingCount: number;
  /** Rows skipped as exact duplicates of an earlier spreadsheet row. */
  skippedExactDuplicateCount: number;
};

type RowPlan =
  | { action: 'create'; row: ValidatedRow }
  | { action: 'update'; row: ValidatedRow; productId: string }
  | { action: 'skip'; row: ValidatedRow; reason: string };

// ---------------------------------------------------------------------------
// Row planning (pure)
// ---------------------------------------------------------------------------

function readProductName(row: ValidatedRow): string | null {
  const value = row.values['name'];

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}

function importableCandidates(report: ImportRunReport): ValidatedRow[] {
  return report.result.rows
    .filter((row) => row.status !== 'error' && readProductName(row) !== null)
    .sort((a, b) => a.rowNumber - b.rowNumber);
}

/**
 * Builds a per-row plan for the chosen strategy. First spreadsheet row
 * wins when the same normalized name appears more than once.
 */
export function planProductImportRows(
  report: ImportRunReport,
  conflicts: ConflictDetectionResult,
  strategy: ImportResolutionStrategy,
  existingByName: ProductNameIndex = new Map(),
): RowPlan[] {
  const duplicateCodeRowNumbers = new Set(
    conflicts.duplicateProductCodes.flatMap((entry) => entry.rowNumbers),
  );

  if (conflicts.duplicateProductCodes.length > 0) {
    return report.result.rows.map((row) => ({
      action: 'skip' as const,
      row,
      reason:
        row.status === 'error'
          ? 'Row has validation errors.'
          : duplicateCodeRowNumbers.has(row.rowNumber)
            ? SKIP_DUPLICATE_PRODUCT_CODE_REASON
            : 'Import blocked due to duplicate product codes.',
    }));
  }

  const plans: RowPlan[] = [];
  const cleanSet = new Set(conflicts.cleanRows);

  const conflictingDuplicateRowNumbers = new Set(
    conflicts.duplicateRowsInFile.map((entry) => entry.rowNumber),
  );

  const exactDuplicateRowNumbers = new Set(
    conflicts.exactDuplicateRows.map((entry) => entry.rowNumber),
  );

  const existingByRow = new Map(
    conflicts.existingProducts.map((entry) => [entry.rowNumber, entry.existingProduct.id]),
  );

  if (strategy === 'new-only') {
    for (const row of report.result.rows) {
      if (row.status === 'error') {
        plans.push({
          action: 'skip',
          row,
          reason: 'Row has validation errors.',
        });
        continue;
      }

      if (readProductName(row) === null) {
        plans.push({ action: 'skip', row, reason: 'Product name is missing.' });
        continue;
      }

      if (cleanSet.has(row.rowNumber)) {
        plans.push({ action: 'create', row });
        continue;
      }

      if (exactDuplicateRowNumbers.has(row.rowNumber)) {
        plans.push({
          action: 'skip',
          row,
          reason: SKIP_EXACT_DUPLICATE_REASON,
        });
        continue;
      }

      if (conflictingDuplicateRowNumbers.has(row.rowNumber)) {
        plans.push({
          action: 'skip',
          row,
          reason: SKIP_CONFLICTING_DUPLICATE_REASON,
        });
        continue;
      }

      if (existingByRow.has(row.rowNumber)) {
        plans.push({
          action: 'skip',
          row,
          reason: SKIP_EXISTING_PRODUCT_REASON,
        });
        continue;
      }

      plans.push({ action: 'skip', row, reason: 'Row was not selected for import.' });
    }

    return plans;
  }

  // update-existing: first row per normalized name → create or update; rest skip
  const seenNames = new Set<string>();

  for (const row of report.result.rows) {
    if (row.status === 'error') {
      plans.push({
        action: 'skip',
        row,
        reason: 'Row has validation errors.',
      });
      continue;
    }

    const name = readProductName(row);

    if (name === null) {
      plans.push({ action: 'skip', row, reason: 'Product name is missing.' });
      continue;
    }

    const key = normalizeProductName(name);

    if (conflictingDuplicateRowNumbers.has(row.rowNumber)) {
      plans.push({
        action: 'skip',
        row,
        reason: SKIP_CONFLICTING_DUPLICATE_REASON,
      });
      continue;
    }

    if (exactDuplicateRowNumbers.has(row.rowNumber)) {
      plans.push({
        action: 'skip',
        row,
        reason: SKIP_EXACT_DUPLICATE_REASON,
      });
      continue;
    }

    if (seenNames.has(key)) {
      plans.push({
        action: 'skip',
        row,
        reason: SKIP_CONFLICTING_DUPLICATE_REASON,
      });
      continue;
    }

    seenNames.add(key);

    const existingId = existingByName.get(key)?.id;

    if (existingId) {
      plans.push({ action: 'update', row, productId: existingId });
    } else {
      plans.push({ action: 'create', row });
    }
  }

  return plans;
}

/** Subset report containing only the rows slated for creation. */
export function reportForCreateRows(
  report: ImportRunReport,
  createRows: readonly ValidatedRow[],
): ImportRunReport {
  const createNumbers = new Set(createRows.map((row) => row.rowNumber));

  return {
    ...report,
    result: {
      ...report.result,
      rows: report.result.rows.filter((row) => createNumbers.has(row.rowNumber)),
    },
  };
}

// ---------------------------------------------------------------------------
// Commit orchestration
// ---------------------------------------------------------------------------

/**
 * Executes the user's conflict resolution choice: creates via the existing
 * commit service, updates via batched Firestore writes.
 */
export async function commitProductImportWithResolution(
  db: Firestore,
  report: ImportRunReport,
  conflicts: ConflictDetectionResult,
  strategy: ImportResolutionStrategy,
  options: CommitOptions,
): Promise<ResolvedCommitResult> {
  const existingByName =
    strategy === 'update-existing'
      ? await loadProductNameIndex(db, options.orgId)
      : new Map();

  const plans = planProductImportRows(report, conflicts, strategy, existingByName);

  const createRows = plans
    .filter((plan): plan is Extract<RowPlan, { action: 'create' }> => plan.action === 'create')
    .map((plan) => plan.row);

  const updatePlans = plans.filter(
    (plan): plan is Extract<RowPlan, { action: 'update' }> => plan.action === 'update',
  );

  let createResult: CommitResult = {
    importedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    documentIds: [],
    rowResults: [],
    commitErrors: [],
  };

  if (createRows.length > 0) {
    createResult = await commitProductImport(
      db,
      reportForCreateRows(report, createRows),
      options,
    );
  }

  const updateOutcome = await applyProductUpdates(db, updatePlans, options);

  const createResultsByRow = new Map(
    createResult.rowResults.map((entry) => [entry.rowNumber, entry]),
  );
  const updateResultsByRow = new Map(
    updateOutcome.rowResults.map((entry) => [entry.rowNumber, entry]),
  );

  const mergedRowResults: CommitRowResult[] = plans.map((plan) => {
    if (plan.action === 'create') {
      return (
        createResultsByRow.get(plan.row.rowNumber) ?? {
          rowNumber: plan.row.rowNumber,
          status: 'failed',
          reason: 'Create did not run for this row.',
        }
      );
    }

    if (plan.action === 'update') {
      return (
        updateResultsByRow.get(plan.row.rowNumber) ?? {
          rowNumber: plan.row.rowNumber,
          status: 'failed',
          reason: 'Update did not run for this row.',
        }
      );
    }

    return {
      rowNumber: plan.row.rowNumber,
      status: 'skipped',
      reason: plan.reason,
    };
  });

  const skippedExistingCount = mergedRowResults.filter(
    (row) => row.status === 'skipped' && row.reason === SKIP_EXISTING_PRODUCT_REASON,
  ).length;
  const skippedExactDuplicateCount = mergedRowResults.filter(
    (row) => row.status === 'skipped' && row.reason === SKIP_EXACT_DUPLICATE_REASON,
  ).length;
  const skippedCount = mergedRowResults.filter(
    (row) =>
      row.status === 'skipped' &&
      row.reason !== SKIP_EXISTING_PRODUCT_REASON &&
      row.reason !== SKIP_EXACT_DUPLICATE_REASON,
  ).length;

  return {
    importedCount: createResult.importedCount,
    skippedCount,
    skippedExistingCount,
    skippedExactDuplicateCount,
    failedCount: mergedRowResults.filter((row) => row.status === 'failed').length,
    documentIds: createResult.documentIds,
    rowResults: mergedRowResults,
    commitErrors: [...createResult.commitErrors, ...updateOutcome.commitErrors],
    updatedCount: updateOutcome.updatedCount,
    updatedDocumentIds: updateOutcome.updatedDocumentIds,
  };
}

// ---------------------------------------------------------------------------
// Product updates (import row → Firestore partial update)
// ---------------------------------------------------------------------------

const FALLBACK_CATEGORY: (typeof DEFAULT_PRODUCT_CATEGORIES)[number] = 'Other';

function toMinorUnits(major: number): number {
  return Math.round(major * 100);
}

function asString(value: NormalizedValue | undefined): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function asNumber(value: NormalizedValue | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function buildProductUpdates(
  values: Readonly<Record<string, NormalizedValue>>,
  userId: string,
): Partial<ProductDocument> {
  const now = Timestamp.now();
  const sellingPrice = asNumber(values['sellingPrice']);

  // Catalog fields only. openingStock / costPrice must not overwrite live
  // currentStock / averageCost on an existing product.
  return {
    code: asString(values['code'])?.trim().toUpperCase() ?? '',
    name: asString(values['name'])?.trim() ?? '',
    category: asString(values['category']) ?? FALLBACK_CATEGORY,
    unit: asString(values['unit']) ?? DEFAULT_PRODUCT_UNIT,
    sellingPrice: sellingPrice === null ? 0 : toMinorUnits(sellingPrice),
    updatedAt: now,
    updatedBy: userId,
  };
}

async function applyProductUpdates(
  db: Firestore,
  updatePlans: readonly Extract<RowPlan, { action: 'update' }>[],
  options: CommitOptions,
): Promise<{
  updatedCount: number;
  updatedDocumentIds: string[];
  rowResults: CommitRowResult[];
  commitErrors: CommitResult['commitErrors'];
}> {
  if (updatePlans.length === 0) {
    return {
      updatedCount: 0,
      updatedDocumentIds: [],
      rowResults: [],
      commitErrors: [],
    };
  }

  const collection = db
    .collection('organizations')
    .doc(options.orgId)
    .collection('products');

  const batchSize = options.batchSize ?? 400;
  const rowResults: CommitRowResult[] = [];
  const updatedDocumentIds: string[] = [];
  const commitErrors: CommitError[] = [];

  for (let start = 0; start < updatePlans.length; start += batchSize) {
    const chunk = updatePlans.slice(start, start + batchSize);
    const batchIndex = Math.floor(start / batchSize);
    const batch = db.batch();

    const pending = chunk.map((plan) => {
      const docRef = collection.doc(plan.productId);
      batch.update(docRef, buildProductUpdates(plan.row.values, options.userId));

      return { rowNumber: plan.row.rowNumber, documentId: plan.productId };
    });

    try {
      await batch.commit();

      for (const entry of pending) {
        updatedDocumentIds.push(entry.documentId);
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

  return {
    updatedCount: updatedDocumentIds.length,
    updatedDocumentIds,
    rowResults,
    commitErrors,
  };
}
