/**
 * Sale Import Conflict Detection.
 *
 * Read-only analysis that runs AFTER product resolution and BEFORE commit.
 * Detects:
 *
 *   1. In-file duplicate sale numbers — split into:
 *        • Exact duplicates (identical importable sale data) → first group kept
 *        • Conflicting duplicates (same number, differing data) → user must fix
 *   2. Sale numbers that already exist in Firestore for the org
 *   3. Exact duplicate unnumbered sales (identical fingerprint)
 *
 * Sale-number matching is trim + uppercase — the same rule saleRepository uses.
 * No writes, no commit, no inventory changes.
 */

import type { Firestore } from 'firebase-admin/firestore';

import type { NormalizedValue } from '@/lib/import/engine/types';
import {
  normalizeSaleDateValue,
  normalizeSaleNumberValue,
} from '@/lib/import/services/sale-import-grouping.service';
import type { ResolvedSaleImportGroup } from '@/lib/import/services/sale-import-product-resolver';

// ---------------------------------------------------------------------------
// Result model
// ---------------------------------------------------------------------------

/** An existing BakeryOS sale that collides with an import group. */
export type ExistingSaleMatch = {
  id: string;
  saleNumber: string;
  saleDate: string;
  customerNameSnapshot: string | null;
};

/** One import group skipped because it is an exact copy of an earlier group. */
export type ExactDuplicateSale = {
  groupKey: string;
  saleNumber: string | null;
  normalizedSaleNumber: string | null;
  rowNumbers: readonly number[];
  /** Import group kept for this duplicate sale number or fingerprint. */
  keptGroupKey: string;
};

/** One import group whose sale number conflicts with another group in the file. */
export type ConflictingDuplicateSale = {
  groupKey: string;
  saleNumber: string;
  normalizedSaleNumber: string;
  rowNumbers: readonly number[];
  /** Other import groups that share this sale number with conflicting data. */
  conflictingGroupKeys: readonly string[];
};

/** One import group whose sale number already exists in Firestore. */
export type ExistingSaleConflict = {
  groupKey: string;
  saleNumber: string;
  normalizedSaleNumber: string;
  rowNumbers: readonly number[];
  existingSale: ExistingSaleMatch;
};

export type SaleConflictDetectionSummary = {
  /** Import groups examined. */
  totalChecked: number;
  /** Import groups automatically skipped as exact duplicates. */
  exactDuplicateGroupCount: number;
  /** Distinct sale numbers (or fingerprints) with exact-duplicate groups. */
  exactDuplicateSaleCount: number;
  /** Import groups involved in a conflicting in-file sale-number duplicate. */
  conflictingDuplicateGroupCount: number;
  /** Distinct sale numbers with conflicting duplicate groups. */
  conflictingDuplicateSaleCount: number;
  /** Import groups that match an existing Firestore sale number. */
  existingSaleCount: number;
  /** Import groups free of blocking conflicts. */
  cleanGroupCount: number;
  /** Import groups blocked from commit. */
  conflictingGroupCount: number;
  /** Import groups with one or more line-level error rows. */
  lineErrorGroupCount: number;
  /** Import groups with cross-row header issues from grouping. */
  groupIssueGroupCount: number;
};

export type SaleConflictDetectionResult = {
  /** Exact duplicate groups — automatically skipped; first group per key is kept. */
  exactDuplicateSales: readonly ExactDuplicateSale[];
  /** Conflicting duplicate groups — same sale number, different importable data. */
  conflictingDuplicateSales: readonly ConflictingDuplicateSale[];
  /** Groups whose sale number already exists in BakeryOS. */
  existingSales: readonly ExistingSaleConflict[];
  /** Import groups safe to commit as new sales. */
  cleanGroups: readonly ResolvedSaleImportGroup[];
  /** Import groups blocked by conflicts or unresolved validation issues. */
  conflictingGroups: readonly ResolvedSaleImportGroup[];
  summary: SaleConflictDetectionSummary;
};

/** normalized sale number → existing sale. Built once per run. */
export type SaleNumberIndex = ReadonlyMap<string, ExistingSaleMatch>;

export const SKIP_EXACT_DUPLICATE_SALE_REASON =
  'Exact duplicate sale; automatically skipped.';
export const SKIP_CONFLICTING_DUPLICATE_SALE_REASON =
  'Conflicting duplicate sale number in the uploaded file.';
export const SKIP_EXISTING_SALE_REASON = 'Sale number already exists in BakeryOS.';

/** Header and line fields compared when classifying in-file duplicate sales. */
export const SALE_DUPLICATE_COMPARE_HEADER_FIELDS = [
  'saleDate',
  'customerName',
  'notes',
] as const;

type SaleDocumentForIndex = {
  saleNumber: string;
  saleDate: string;
  customerNameSnapshot: string | null;
  deletedAt: unknown;
};

// ---------------------------------------------------------------------------
// Normalization & fingerprinting
// ---------------------------------------------------------------------------

function readTrimmedString(value: NormalizedValue | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}

function normalizeCustomerNameValue(value: NormalizedValue | undefined): string | null {
  const trimmed = readTrimmedString(value);

  return trimmed ? trimmed.toLowerCase() : null;
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

function lineProductReference(group: ResolvedSaleImportGroup, rowNumber: number): NormalizedValue {
  const line = group.lines.find((entry) => entry.rowNumber === rowNumber);

  if (!line) {
    return null;
  }

  if (line.resolvedProduct) {
    return line.resolvedProduct.id;
  }

  const code = readTrimmedString(line.values['productCode']);

  if (code) {
    return code.trim().toUpperCase();
  }

  const name = readTrimmedString(line.values['productName']);

  return name ? name.toLowerCase() : null;
}

/** Stable fingerprint of importable sale data used for exact-duplicate detection. */
export function saleImportFingerprint(group: ResolvedSaleImportGroup): string {
  const parts: NormalizedValue[] = [];

  for (const field of SALE_DUPLICATE_COMPARE_HEADER_FIELDS) {
    if (field === 'saleDate') {
      parts.push(normalizeSaleDateValue(group.header[field]) ?? normalizeCompareValue(group.header[field]));
      continue;
    }

    if (field === 'customerName') {
      parts.push(
        normalizeCustomerNameValue(group.header[field]) ?? normalizeCompareValue(group.header[field]),
      );
      continue;
    }

    parts.push(normalizeCompareValue(group.header[field]));
  }

  const sortedLines = [...group.lines].sort((a, b) => a.rowNumber - b.rowNumber);

  for (const line of sortedLines) {
    parts.push(lineProductReference(group, line.rowNumber));
    parts.push(normalizeCompareValue(line.values['quantity']));
    parts.push(normalizeCompareValue(line.values['sellingPrice']));
  }

  return JSON.stringify(parts);
}

export function areSalesExactDuplicates(groups: readonly ResolvedSaleImportGroup[]): boolean {
  if (groups.length < 2) {
    return true;
  }

  const fingerprint = saleImportFingerprint(groups[0]!);

  return groups.every((group) => saleImportFingerprint(group) === fingerprint);
}

function firstRowNumber(group: ResolvedSaleImportGroup): number {
  return group.rowNumbers[0] ?? Number.MAX_SAFE_INTEGER;
}

function sortGroupsByFirstRow(groups: readonly ResolvedSaleImportGroup[]): ResolvedSaleImportGroup[] {
  return [...groups].sort((a, b) => firstRowNumber(a) - firstRowNumber(b));
}

function hasLineErrors(group: ResolvedSaleImportGroup): boolean {
  return group.lines.some((line) => line.status === 'error');
}

function hasGroupIssues(group: ResolvedSaleImportGroup): boolean {
  return group.groupIssues.length > 0;
}

// ---------------------------------------------------------------------------
// Firestore sale index (read-only, one query)
// ---------------------------------------------------------------------------

function buildSaleNumberIndex(
  docs: ReadonlyArray<{ id: string; data: SaleDocumentForIndex }>,
): SaleNumberIndex {
  const bySaleNumber = new Map<string, ExistingSaleMatch>();

  for (const doc of docs) {
    const normalizedSaleNumber = normalizeSaleNumberValue(doc.data.saleNumber);

    if (!normalizedSaleNumber || bySaleNumber.has(normalizedSaleNumber)) {
      continue;
    }

    bySaleNumber.set(normalizedSaleNumber, {
      id: doc.id,
      saleNumber: doc.data.saleNumber,
      saleDate: doc.data.saleDate,
      customerNameSnapshot: doc.data.customerNameSnapshot ?? null,
    });
  }

  return bySaleNumber;
}

/**
 * Loads non-deleted sale numbers for conflict detection.
 * Soft-deleted sales are ignored.
 */
export async function loadSaleNumberIndex(db: Firestore, orgId: string): Promise<SaleNumberIndex> {
  const snapshot = await db
    .collection('organizations')
    .doc(orgId)
    .collection('sales')
    .where('deletedAt', '==', null)
    .get();

  return buildSaleNumberIndex(
    snapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as SaleDocumentForIndex,
    })),
  );
}

// ---------------------------------------------------------------------------
// Conflict detection (pure)
// ---------------------------------------------------------------------------

function classifyNumberedDuplicates(
  numberedGroups: readonly ResolvedSaleImportGroup[],
): {
  exactDuplicateSales: ExactDuplicateSale[];
  conflictingDuplicateSales: ConflictingDuplicateSale[];
  canonicalGroupKeys: Set<string>;
  exactDuplicateSkipKeys: Set<string>;
  conflictingGroupKeys: Set<string>;
  exactDuplicateSaleCount: number;
  conflictingDuplicateSaleCount: number;
} {
  const bySaleNumber = new Map<string, ResolvedSaleImportGroup[]>();

  for (const group of numberedGroups) {
    const normalizedSaleNumber = group.header.normalizedSaleNumber!;

    const bucket = bySaleNumber.get(normalizedSaleNumber);

    if (bucket) {
      bucket.push(group);
    } else {
      bySaleNumber.set(normalizedSaleNumber, [group]);
    }
  }

  const exactDuplicateSales: ExactDuplicateSale[] = [];
  const conflictingDuplicateSales: ConflictingDuplicateSale[] = [];
  const canonicalGroupKeys = new Set<string>();
  const exactDuplicateSkipKeys = new Set<string>();
  const conflictingGroupKeys = new Set<string>();
  let exactDuplicateSaleCount = 0;
  let conflictingDuplicateSaleCount = 0;

  for (const [normalizedSaleNumber, bucket] of bySaleNumber) {
    const sortedBucket = sortGroupsByFirstRow(bucket);

    if (sortedBucket.length === 1) {
      canonicalGroupKeys.add(sortedBucket[0]!.groupKey);
      continue;
    }

    if (areSalesExactDuplicates(sortedBucket)) {
      exactDuplicateSaleCount += 1;
      const keptGroup = sortedBucket[0]!;

      canonicalGroupKeys.add(keptGroup.groupKey);

      for (const duplicateGroup of sortedBucket.slice(1)) {
        exactDuplicateSales.push({
          groupKey: duplicateGroup.groupKey,
          saleNumber: duplicateGroup.header.saleNumber,
          normalizedSaleNumber,
          rowNumbers: duplicateGroup.rowNumbers,
          keptGroupKey: keptGroup.groupKey,
        });
        exactDuplicateSkipKeys.add(duplicateGroup.groupKey);
      }

      continue;
    }

    conflictingDuplicateSaleCount += 1;
    const allGroupKeys = sortedBucket.map((group) => group.groupKey);

    for (const group of sortedBucket) {
      conflictingDuplicateSales.push({
        groupKey: group.groupKey,
        saleNumber: group.header.saleNumber ?? normalizedSaleNumber,
        normalizedSaleNumber,
        rowNumbers: group.rowNumbers,
        conflictingGroupKeys: allGroupKeys.filter((key) => key !== group.groupKey),
      });
      conflictingGroupKeys.add(group.groupKey);
    }
  }

  return {
    exactDuplicateSales,
    conflictingDuplicateSales,
    canonicalGroupKeys,
    exactDuplicateSkipKeys,
    conflictingGroupKeys,
    exactDuplicateSaleCount,
    conflictingDuplicateSaleCount,
  };
}

function classifyUnnumberedExactDuplicates(
  unnumberedGroups: readonly ResolvedSaleImportGroup[],
): {
  exactDuplicateSales: ExactDuplicateSale[];
  canonicalGroupKeys: Set<string>;
  exactDuplicateSkipKeys: Set<string>;
  exactDuplicateSaleCount: number;
} {
  const byFingerprint = new Map<string, ResolvedSaleImportGroup[]>();

  for (const group of unnumberedGroups) {
    const fingerprint = saleImportFingerprint(group);
    const bucket = byFingerprint.get(fingerprint);

    if (bucket) {
      bucket.push(group);
    } else {
      byFingerprint.set(fingerprint, [group]);
    }
  }

  const exactDuplicateSales: ExactDuplicateSale[] = [];
  const canonicalGroupKeys = new Set<string>();
  const exactDuplicateSkipKeys = new Set<string>();
  let exactDuplicateSaleCount = 0;

  for (const bucket of byFingerprint.values()) {
    const sortedBucket = sortGroupsByFirstRow(bucket);

    if (sortedBucket.length === 1) {
      canonicalGroupKeys.add(sortedBucket[0]!.groupKey);
      continue;
    }

    exactDuplicateSaleCount += 1;
    const keptGroup = sortedBucket[0]!;

    canonicalGroupKeys.add(keptGroup.groupKey);

    for (const duplicateGroup of sortedBucket.slice(1)) {
      exactDuplicateSales.push({
        groupKey: duplicateGroup.groupKey,
        saleNumber: duplicateGroup.header.saleNumber,
        normalizedSaleNumber: duplicateGroup.header.normalizedSaleNumber,
        rowNumbers: duplicateGroup.rowNumbers,
        keptGroupKey: keptGroup.groupKey,
      });
      exactDuplicateSkipKeys.add(duplicateGroup.groupKey);
    }
  }

  return {
    exactDuplicateSales,
    canonicalGroupKeys,
    exactDuplicateSkipKeys,
    exactDuplicateSaleCount,
  };
}

/**
 * Analyzes resolved sale import groups for commit conflicts.
 *
 * Pass an empty index to skip Firestore checks (useful for unit tests).
 * All validation issues on groups and lines are preserved unchanged.
 */
export function detectSaleImportConflicts(
  groups: readonly ResolvedSaleImportGroup[],
  existingBySaleNumber: SaleNumberIndex = new Map(),
): SaleConflictDetectionResult {
  const sortedGroups = sortGroupsByFirstRow(groups);
  const numberedGroups = sortedGroups.filter((group) => group.header.normalizedSaleNumber !== null);
  const unnumberedGroups = sortedGroups.filter((group) => group.header.normalizedSaleNumber === null);

  const numbered = classifyNumberedDuplicates(numberedGroups);
  const unnumbered = classifyUnnumberedExactDuplicates(unnumberedGroups);

  const exactDuplicateSales = [...numbered.exactDuplicateSales, ...unnumbered.exactDuplicateSales];
  const exactDuplicateSkipKeys = new Set([
    ...numbered.exactDuplicateSkipKeys,
    ...unnumbered.exactDuplicateSkipKeys,
  ]);

  const existingSales: ExistingSaleConflict[] = [];
  const existingSaleGroupKeys = new Set<string>();

  for (const groupKey of numbered.canonicalGroupKeys) {
    const group = sortedGroups.find((entry) => entry.groupKey === groupKey);

    if (!group?.header.normalizedSaleNumber) {
      continue;
    }

    const existing = existingBySaleNumber.get(group.header.normalizedSaleNumber);

    if (existing) {
      existingSales.push({
        groupKey: group.groupKey,
        saleNumber: group.header.saleNumber ?? group.header.normalizedSaleNumber,
        normalizedSaleNumber: group.header.normalizedSaleNumber,
        rowNumbers: group.rowNumbers,
        existingSale: existing,
      });
      existingSaleGroupKeys.add(group.groupKey);
    }
  }

  const blockingGroupKeys = new Set<string>([
    ...numbered.conflictingGroupKeys,
    ...existingSaleGroupKeys,
  ]);

  const cleanGroups: ResolvedSaleImportGroup[] = [];
  const conflictingGroups: ResolvedSaleImportGroup[] = [];

  for (const group of sortedGroups) {
    const blocked =
      blockingGroupKeys.has(group.groupKey) ||
      exactDuplicateSkipKeys.has(group.groupKey) ||
      hasLineErrors(group) ||
      hasGroupIssues(group);

    if (blocked) {
      conflictingGroups.push(group);
    } else {
      cleanGroups.push(group);
    }
  }

  const lineErrorGroupCount = sortedGroups.filter(hasLineErrors).length;
  const groupIssueGroupCount = sortedGroups.filter(hasGroupIssues).length;

  return {
    exactDuplicateSales,
    conflictingDuplicateSales: numbered.conflictingDuplicateSales,
    existingSales,
    cleanGroups,
    conflictingGroups,
    summary: {
      totalChecked: sortedGroups.length,
      exactDuplicateGroupCount: exactDuplicateSales.length,
      exactDuplicateSaleCount: numbered.exactDuplicateSaleCount + unnumbered.exactDuplicateSaleCount,
      conflictingDuplicateGroupCount: numbered.conflictingDuplicateSales.length,
      conflictingDuplicateSaleCount: numbered.conflictingDuplicateSaleCount,
      existingSaleCount: existingSales.length,
      cleanGroupCount: cleanGroups.length,
      conflictingGroupCount: conflictingGroups.length,
      lineErrorGroupCount,
      groupIssueGroupCount,
    },
  };
}

/**
 * Convenience: load the org's sale-number index, then detect conflicts.
 */
export async function detectSaleImportConflictsForOrg(
  groups: readonly ResolvedSaleImportGroup[],
  db: Firestore,
  orgId: string,
): Promise<SaleConflictDetectionResult> {
  const existingBySaleNumber = await loadSaleNumberIndex(db, orgId);

  return detectSaleImportConflicts(groups, existingBySaleNumber);
}

export { buildSaleNumberIndex };
