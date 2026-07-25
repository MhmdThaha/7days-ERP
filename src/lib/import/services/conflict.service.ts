/**
 * Product Import Conflict Detection.
 *
 * Read-only analysis that runs AFTER the import pipeline and BEFORE
 * commit. Detects:
 *
 *   1. In-file duplicate product names — split into:
 *        • Exact duplicates (identical importable fields) → first row kept
 *        • Conflicting duplicates (same name, differing fields) → user must fix
 *   2. Product names that already exist in Firestore for the org
 *   3. Duplicate product codes in the file or already used in BakeryOS
 *
 * Name matching is trim + case-insensitive — the same rule
 * productRepository.findByName uses. Product codes are trim + uppercase,
 * matching productRepository.findByCode. No writes, no commit changes,
 * no engine changes.
 */

import type { Firestore } from 'firebase-admin/firestore';

import type { NormalizedValue, ValidatedRow } from '@/lib/import/engine/types';
import type { ImportRunReport } from '@/lib/import/services/import.service';
import type { ProductDocument } from '@/lib/repositories/product.repository';

// ---------------------------------------------------------------------------
// Result model
// ---------------------------------------------------------------------------

/** An existing BakeryOS product that collides with an import row. */
export type ExistingProductMatch = {
  id: string;
  name: string;
  code: string;
};

/** One row automatically skipped because it is an exact copy of an earlier row. */
export type ExactDuplicateRow = {
  rowNumber: number;
  name: string;
  normalizedName: string;
  /** Spreadsheet row kept for import (first occurrence in the file). */
  keptRowNumber: number;
};

/** One row whose product name conflicts with another row that has different data. */
export type InFileDuplicateConflict = {
  rowNumber: number;
  /** Name as it appears on this row (already trimmed by the normalizer). */
  name: string;
  normalizedName: string;
  /** Other spreadsheet rows that share this name with conflicting data. */
  conflictingRowNumbers: readonly number[];
};

/** One row whose product name already exists in Firestore. */
export type ExistingProductConflict = {
  rowNumber: number;
  name: string;
  normalizedName: string;
  existingProduct: ExistingProductMatch;
};

/** One product code that appears more than once or collides with BakeryOS. */
export type DuplicateProductCodeConflict = {
  /** Code in BakeryOS display form (trimmed, uppercased). */
  code: string;
  normalizedCode: string;
  /** Spreadsheet rows that use this code. */
  rowNumbers: readonly number[];
  /** Set when the code is already assigned to a different product in Firestore. */
  existingProduct?: ExistingProductMatch;
};

export type ConflictDetectionSummary = {
  /** Rows that were examined (importable rows with a product name). */
  totalChecked: number;
  /** Rows automatically skipped as exact duplicates of an earlier row. */
  exactDuplicateRowCount: number;
  /** Distinct product names with exact-duplicate rows in the file. */
  exactDuplicateNameCount: number;
  /** Rows involved in a conflicting in-file name duplicate. */
  conflictingDuplicateRowCount: number;
  /** Distinct product names with conflicting duplicate rows. */
  conflictingDuplicateNameCount: number;
  /** @deprecated Alias for conflictingDuplicateNameCount — kept for callers. */
  duplicateNameCount: number;
  /** @deprecated Alias for conflictingDuplicateRowCount — kept for callers. */
  duplicateRowCount: number;
  /** Rows that match an existing Firestore product (canonical row per name). */
  existingProductCount: number;
  /** Distinct existing product names matched (one per Firestore product). */
  existingProductNameCount: number;
  /** Importable rows with no blocking conflicts (includes first exact-duplicate rows). */
  cleanRowCount: number;
  /** Distinct product codes that block import. */
  duplicateProductCodeCount: number;
};

export type ConflictDetectionResult = {
  /** Conflicting duplicate rows — same name, different importable field values. */
  duplicateRowsInFile: readonly InFileDuplicateConflict[];
  /** Exact duplicate rows — automatically skipped; first row per name is kept. */
  exactDuplicateRows: readonly ExactDuplicateRow[];
  existingProducts: readonly ExistingProductConflict[];
  /** Duplicate product codes — import is blocked until the file is fixed. */
  duplicateProductCodes: readonly DuplicateProductCodeConflict[];
  /** Spreadsheet row numbers free of blocking conflicts (safe to import as-is). */
  cleanRows: readonly number[];
  summary: ConflictDetectionSummary;
};

/** normalized name → existing product. Built once per run. */
export type ProductNameIndex = ReadonlyMap<string, ExistingProductMatch>;

/** normalized code → existing product. Built once per run. */
export type ProductCodeIndex = ReadonlyMap<string, ExistingProductMatch>;

export type ProductImportIndex = {
  byName: ProductNameIndex;
  byCode: ProductCodeIndex;
};

/** Importable product fields compared when classifying in-file duplicates. */
export const PRODUCT_DUPLICATE_COMPARE_FIELDS = [
  'code',
  'category',
  'unit',
  'sellingPrice',
  'costPrice',
  'gstRate',
  'openingStock',
  'minimumStock',
] as const;

export const SKIP_EXACT_DUPLICATE_REASON =
  'Exact duplicate row; automatically skipped.';
export const SKIP_CONFLICTING_DUPLICATE_REASON =
  'Conflicting duplicate product name in the uploaded file.';
export const SKIP_EXISTING_PRODUCT_REASON = 'Product already exists in BakeryOS.';
export const SKIP_DUPLICATE_PRODUCT_CODE_REASON =
  'Duplicate product code; fix your Excel before importing.';

// ---------------------------------------------------------------------------
// Name / code normalization (matches product repository lookups)
// ---------------------------------------------------------------------------

export function normalizeProductCode(code: string): string {
  return code.trim().toUpperCase();
}

export function normalizeProductName(name: string): string {
  return name.trim().toLowerCase();
}

function readProductCode(row: ValidatedRow): string | null {
  const value = row.values['code'];

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}

function readProductName(row: ValidatedRow): string | null {
  const value = row.values['name'];

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}

function normalizeCompareValue(value: NormalizedValue | undefined): NormalizedValue {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    return trimmed === '' ? null : trimmed;
  }

  return value;
}

/** Stable fingerprint of importable row data used for exact-duplicate detection. */
export function rowImportFingerprint(row: ValidatedRow): string {
  const name = readProductName(row);
  const parts: NormalizedValue[] = [name ? normalizeProductName(name) : null];

  for (const field of PRODUCT_DUPLICATE_COMPARE_FIELDS) {
    parts.push(normalizeCompareValue(row.values[field]));
  }

  return JSON.stringify(parts);
}

export function areRowsExactDuplicates(rows: readonly ValidatedRow[]): boolean {
  if (rows.length < 2) {
    return true;
  }

  const fingerprint = rowImportFingerprint(rows[0]!);

  return rows.every((row) => rowImportFingerprint(row) === fingerprint);
}

// ---------------------------------------------------------------------------
// Firestore product index (read-only, one query)
// ---------------------------------------------------------------------------

function buildProductImportIndex(docs: ReadonlyArray<{ id: string; data: ProductDocument }>): ProductImportIndex {
  const byName = new Map<string, ExistingProductMatch>();
  const byCode = new Map<string, ExistingProductMatch>();

  for (const doc of docs) {
    const data = doc.data;
    const nameKey = normalizeProductName(data.name);

    if (!byName.has(nameKey)) {
      byName.set(nameKey, { id: doc.id, name: data.name, code: data.code });
    }

    const code = data.code?.trim();

    if (code) {
      const codeKey = normalizeProductCode(code);

      if (!byCode.has(codeKey)) {
        byCode.set(codeKey, { id: doc.id, name: data.name, code: data.code });
      }
    }
  }

  return { byName, byCode };
}

/**
 * Loads non-deleted product names and codes for conflict detection.
 * Soft-deleted products are ignored.
 */
export async function loadProductImportIndex(
  db: Firestore,
  orgId: string,
): Promise<ProductImportIndex> {
  const snapshot = await db
    .collection('organizations')
    .doc(orgId)
    .collection('products')
    .where('deletedAt', '==', null)
    .get();

  return buildProductImportIndex(
    snapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as ProductDocument,
    })),
  );
}

/**
 * Loads every non-deleted product name for an organization into a
 * normalized-name → product map. Soft-deleted products are ignored so
 * re-importing a deleted name is not treated as a conflict.
 */
export async function loadProductNameIndex(
  db: Firestore,
  orgId: string,
): Promise<ProductNameIndex> {
  const { byName } = await loadProductImportIndex(db, orgId);

  return byName;
}

function detectDuplicateProductCodes(
  candidates: readonly ValidatedRow[],
  existingByCode: ProductCodeIndex,
  existingByName: ProductNameIndex,
): DuplicateProductCodeConflict[] {
  const byCode = new Map<string, { code: string; rows: ValidatedRow[] }>();

  for (const row of candidates) {
    const code = readProductCode(row);

    if (code === null) {
      continue;
    }

    const key = normalizeProductCode(code);
    const bucket = byCode.get(key);

    if (bucket) {
      bucket.rows.push(row);
    } else {
      byCode.set(key, { code, rows: [row] });
    }
  }

  const conflicts = new Map<string, DuplicateProductCodeConflict>();

  function upsertConflict(
    normalizedCode: string,
    displayCode: string,
    rowNumber: number,
    existingProduct?: ExistingProductMatch,
  ) {
    const prev = conflicts.get(normalizedCode);
    const rowNumbers = prev
      ? [...new Set([...prev.rowNumbers, rowNumber])].sort((a, b) => a - b)
      : [rowNumber];

    conflicts.set(normalizedCode, {
      code: displayCode,
      normalizedCode,
      rowNumbers,
      existingProduct: existingProduct ?? prev?.existingProduct,
    });
  }

  for (const [normalizedCode, bucket] of byCode) {
    const displayCode = normalizeProductCode(bucket.code);

    if (bucket.rows.length >= 2 && !areRowsExactDuplicates(bucket.rows)) {
      for (const row of bucket.rows) {
        upsertConflict(normalizedCode, displayCode, row.rowNumber);
      }
    }

    for (const row of bucket.rows) {
      const existing = existingByCode.get(normalizedCode);

      if (!existing) {
        continue;
      }

      const name = readProductName(row)!;
      const nameMatch = existingByName.get(normalizeProductName(name));

      if (nameMatch?.id === existing.id) {
        continue;
      }

      upsertConflict(normalizedCode, displayCode, row.rowNumber, existing);
    }
  }

  return [...conflicts.values()].sort((a, b) => a.code.localeCompare(b.code));
}

// ---------------------------------------------------------------------------
// Conflict detection (pure)
// ---------------------------------------------------------------------------

/**
 * Analyzes an ImportRunReport for import conflicts.
 *
 * Only importable rows (valid / warning) with a product name are checked —
 * error rows are already excluded from commit, so they are not part of
 * the conflict surface. Pass empty indexes to skip Firestore checks
 * (useful for unit-testing in-file conflicts alone).
 */
export function detectProductImportConflicts(
  report: ImportRunReport,
  existingByNormalizedName: ProductNameIndex = new Map(),
  existingByCode: ProductCodeIndex = new Map(),
): ConflictDetectionResult {
  if (report.entityType !== 'product') {
    throw new Error(
      `detectProductImportConflicts received a "${report.entityType}" report; it only analyzes products.`,
    );
  }

  const candidates = report.result.rows
    .filter((row) => row.status !== 'error' && readProductName(row) !== null)
    .sort((a, b) => a.rowNumber - b.rowNumber);

  const rowsByName = new Map<string, ValidatedRow[]>();

  for (const row of candidates) {
    const name = readProductName(row)!;
    const key = normalizeProductName(name);
    const bucket = rowsByName.get(key);

    if (bucket) {
      bucket.push(row);
    } else {
      rowsByName.set(key, [row]);
    }
  }

  const duplicateRowsInFile: InFileDuplicateConflict[] = [];
  const exactDuplicateRows: ExactDuplicateRow[] = [];
  const canonicalRows: ValidatedRow[] = [];
  let exactDuplicateNameCount = 0;
  let conflictingDuplicateNameCount = 0;

  for (const [normalizedName, groupRows] of rowsByName) {
    if (groupRows.length === 1) {
      canonicalRows.push(groupRows[0]!);
      continue;
    }

    if (areRowsExactDuplicates(groupRows)) {
      exactDuplicateNameCount += 1;
      const keptRow = groupRows[0]!;

      canonicalRows.push(keptRow);

      for (const row of groupRows.slice(1)) {
        exactDuplicateRows.push({
          rowNumber: row.rowNumber,
          name: readProductName(row)!,
          normalizedName,
          keptRowNumber: keptRow.rowNumber,
        });
      }

      continue;
    }

    conflictingDuplicateNameCount += 1;
    const allRowNumbers = groupRows.map((row) => row.rowNumber);

    for (const row of groupRows) {
      duplicateRowsInFile.push({
        rowNumber: row.rowNumber,
        name: readProductName(row)!,
        normalizedName,
        conflictingRowNumbers: allRowNumbers.filter((n) => n !== row.rowNumber),
      });
    }
  }

  const existingProducts: ExistingProductConflict[] = [];

  for (const row of canonicalRows) {
    const name = readProductName(row)!;
    const normalizedName = normalizeProductName(name);
    const existing = existingByNormalizedName.get(normalizedName);

    if (existing) {
      existingProducts.push({
        rowNumber: row.rowNumber,
        name,
        normalizedName,
        existingProduct: existing,
      });
    }
  }

  const duplicateProductCodes = detectDuplicateProductCodes(
    candidates,
    existingByCode,
    existingByNormalizedName,
  );

  const hasDuplicateProductCodes = duplicateProductCodes.length > 0;

  const blockingRowNumbers = new Set<number>([
    ...duplicateRowsInFile.map((conflict) => conflict.rowNumber),
    ...existingProducts.map((conflict) => conflict.rowNumber),
  ]);

  const exactDuplicateSkipRows = new Set(
    exactDuplicateRows.map((entry) => entry.rowNumber),
  );

  const cleanRows = hasDuplicateProductCodes
    ? []
    : canonicalRows
        .filter(
          (row) =>
            !blockingRowNumbers.has(row.rowNumber) &&
            !exactDuplicateSkipRows.has(row.rowNumber),
        )
        .map((row) => row.rowNumber);

  const existingProductNameCount = new Set(
    existingProducts.map((conflict) => conflict.normalizedName),
  ).size;

  return {
    duplicateRowsInFile,
    exactDuplicateRows,
    existingProducts,
    duplicateProductCodes,
    cleanRows,
    summary: {
      totalChecked: candidates.length,
      exactDuplicateRowCount: exactDuplicateRows.length,
      exactDuplicateNameCount,
      conflictingDuplicateRowCount: duplicateRowsInFile.length,
      conflictingDuplicateNameCount,
      duplicateNameCount: conflictingDuplicateNameCount,
      duplicateRowCount: duplicateRowsInFile.length,
      existingProductCount: existingProducts.length,
      existingProductNameCount,
      cleanRowCount: cleanRows.length,
      duplicateProductCodeCount: duplicateProductCodes.length,
    },
  };
}

/**
 * Convenience: load the org's product index, then detect conflicts.
 * Callers that already have an index (or a mock) should use the pure
 * detectProductImportConflicts directly.
 */
export async function detectProductImportConflictsForOrg(
  report: ImportRunReport,
  db: Firestore,
  orgId: string,
): Promise<ConflictDetectionResult> {
  const { byName, byCode } = await loadProductImportIndex(db, orgId);

  return detectProductImportConflicts(report, byName, byCode);
}
