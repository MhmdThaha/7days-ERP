/**
 * Duplicate Import Protection — stateless analysis against prior completed imports.
 *
 * Pure service: no UI, no Firestore writes, no import execution.
 */

import type { NormalizedValue } from '@/lib/import/engine/types';
import type { ResolvedImportReviewRow } from '@/lib/import/resolution/types';
import {
  DUPLICATE_IMPORT_RECOMMENDATION,
  DUPLICATE_IMPORT_STATUS,
  isBlockingImportHistoryStatus,
  type DetectDuplicateImportInput,
  type DuplicateImportFingerprints,
  type DuplicateImportMatchedImport,
  type DuplicateImportRecommendation,
  type DuplicateImportResult,
  type DuplicateImportStatus,
  type ImportHistoryRecord,
} from '@/lib/import/duplicate/duplicate-import.types';

const ROW_FINGERPRINT_FIELDS = [
  'saleDate',
  'customerName',
  'product',
  'quantity',
  'amount',
  'saleNumber',
] as const;

const CONFIDENCE = {
  EXACT_FILE: 100,
  INVOICE_NEAR_EXACT: 95,
  ROW_MAJORITY: 90,
  LARGE_OVERLAP: 70,
  FEW_MATCHES: 40,
  IGNORE_BELOW: 40,
} as const;

const INVOICE_NEAR_EXACT_RATIO = 0.95;
const ROW_MAJORITY_RATIO = 0.9;
const LARGE_OVERLAP_RATIO = 0.7;
const FEW_MATCHES_RATIO = 0.15;
const MIN_ROWS_FOR_WEAK_SIGNAL = 2;

type SignalMatch = {
  record: ImportHistoryRecord;
  confidence: number;
  matchedRows: number;
  matchedInvoices: readonly string[];
  duplicateRowFingerprints: readonly string[];
  reasons: readonly string[];
  primarySignal: 'file' | 'invoice' | 'rows';
};

/**
 * Builds stable row + file fingerprints from a resolved sales review payload.
 * Ignores filename, column order, and insignificant whitespace.
 */
export function buildDuplicateImportFingerprints(
  rows: readonly ResolvedImportReviewRow[],
): DuplicateImportFingerprints {
  const rowFingerprints = rows
    .map((row) => buildDuplicateImportRowFingerprint(row))
    .filter((fingerprint) => fingerprint.length > 0)
    .sort();

  return {
    fileFingerprint: buildDuplicateImportFileFingerprint(rowFingerprints),
    rowFingerprints,
    invoiceNumbers: extractInvoiceNumbers(rows),
  };
}

/** Stable row fingerprint using normalized business fields only. */
export function buildDuplicateImportRowFingerprint(row: ResolvedImportReviewRow): string {
  const values = row.normalizedValues;

  const parts: Record<(typeof ROW_FINGERPRINT_FIELDS)[number], string | null> = {
    saleDate: normalizeFingerprintDate(values['saleDate']),
    customerName: normalizeFingerprintText(values['customerName']),
    product: resolveProductFingerprintKey(row),
    quantity: normalizeFingerprintNumber(values['quantity']),
    amount: normalizeFingerprintAmount(values),
    saleNumber: normalizeFingerprintInvoice(values['saleNumber']),
  };

  return JSON.stringify(
    ROW_FINGERPRINT_FIELDS.map((field) => parts[field]),
  );
}

/** File fingerprint — sorted row fingerprints, order-independent. */
export function buildDuplicateImportFileFingerprint(
  rowFingerprints: readonly string[],
): string {
  if (rowFingerprints.length === 0) {
    return '';
  }

  return [...rowFingerprints].sort().join('\u001f');
}

/**
 * Detects whether a resolved sales review likely duplicates a prior import.
 * Cancelled and rolled-back imports never contribute to blocking signals.
 */
export function detectDuplicateImport(input: DetectDuplicateImportInput): DuplicateImportResult {
  const fingerprints = buildDuplicateImportFingerprints(input.resolvedReview.rows);
  const eligibleHistory = input.importHistory.filter((record) =>
    isBlockingImportHistoryStatus(record.status),
  );

  if (eligibleHistory.length === 0 || fingerprints.rowFingerprints.length === 0) {
    return emptyResult();
  }

  const currentInvoiceSet = new Set(fingerprints.invoiceNumbers);
  const currentRowSet = new Set(fingerprints.rowFingerprints);

  let bestMatch: SignalMatch | null = null;

  for (const record of eligibleHistory) {
    const candidates: SignalMatch[] = [];

    if (
      fingerprints.fileFingerprint !== '' &&
      record.fileFingerprint === fingerprints.fileFingerprint
    ) {
      candidates.push({
        record,
        confidence: CONFIDENCE.EXACT_FILE,
        matchedRows: fingerprints.rowFingerprints.length,
        matchedInvoices: intersectInvoices(currentInvoiceSet, record.invoiceNumbers),
        duplicateRowFingerprints: [...fingerprints.rowFingerprints],
        reasons: ['Identical file fingerprint to a completed import.'],
        primarySignal: 'file',
      });
    }

    if (currentInvoiceSet.size > 0 && record.invoiceNumbers.length > 0) {
      const matchedInvoices = intersectInvoices(currentInvoiceSet, record.invoiceNumbers);
      const invoiceRatio = matchedInvoices.length / currentInvoiceSet.size;

      if (invoiceRatio >= INVOICE_NEAR_EXACT_RATIO) {
        const duplicateRowFingerprints = listOverlappingFingerprints(
          currentRowSet,
          record.rowFingerprints,
        );

        candidates.push({
          record,
          confidence: CONFIDENCE.INVOICE_NEAR_EXACT,
          matchedRows: duplicateRowFingerprints.length,
          matchedInvoices,
          duplicateRowFingerprints,
          reasons: [
            `${matchedInvoices.length} of ${currentInvoiceSet.size} invoice numbers match a completed import.`,
          ],
          primarySignal: 'invoice',
        });
      }
    }

    const duplicateRowFingerprints = listOverlappingFingerprints(
      currentRowSet,
      record.rowFingerprints,
    );
    const matchedRows = duplicateRowFingerprints.length;
    const rowRatio =
      fingerprints.rowFingerprints.length === 0
        ? 0
        : matchedRows / fingerprints.rowFingerprints.length;

    if (matchedRows >= MIN_ROWS_FOR_WEAK_SIGNAL || rowRatio >= ROW_MAJORITY_RATIO) {
      const rowSignal = classifyRowOverlap(matchedRows, rowRatio);

      if (rowSignal) {
        candidates.push({
          record,
          confidence: rowSignal.confidence,
          matchedRows,
          matchedInvoices: intersectInvoices(currentInvoiceSet, record.invoiceNumbers),
          duplicateRowFingerprints,
          reasons: rowSignal.reasons,
          primarySignal: 'rows',
        });
      }
    }

    for (const candidate of candidates) {
      if (!bestMatch || candidate.confidence > bestMatch.confidence) {
        bestMatch = candidate;
      } else if (
        candidate.confidence === bestMatch.confidence &&
        candidate.matchedRows > bestMatch.matchedRows
      ) {
        bestMatch = candidate;
      }
    }
  }

  if (!bestMatch || bestMatch.confidence < CONFIDENCE.IGNORE_BELOW) {
    return emptyResult();
  }

  return buildResult(bestMatch);
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function emptyResult(): DuplicateImportResult {
  return {
    status: DUPLICATE_IMPORT_STATUS.NO_DUPLICATE,
    confidence: 0,
    matchedImport: null,
    matchedInvoices: [],
    matchedRows: 0,
    duplicateRowFingerprints: [],
    duplicateReasons: [],
    recommendation: DUPLICATE_IMPORT_RECOMMENDATION.CONTINUE,
  };
}

function buildResult(match: SignalMatch): DuplicateImportResult {
  const status = resolveStatus(match.confidence);

  return {
    status,
    confidence: match.confidence,
    matchedImport: toMatchedImport(match.record),
    matchedInvoices: match.matchedInvoices,
    matchedRows: match.matchedRows,
    duplicateRowFingerprints: match.duplicateRowFingerprints,
    duplicateReasons: match.reasons,
    recommendation: resolveRecommendation(status, match.confidence, match.primarySignal),
  };
}

function resolveStatus(confidence: number): DuplicateImportStatus {
  if (confidence >= CONFIDENCE.EXACT_FILE) {
    return DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE;
  }

  if (confidence >= CONFIDENCE.ROW_MAJORITY) {
    return DUPLICATE_IMPORT_STATUS.HIGH_CONFIDENCE_DUPLICATE;
  }

  if (confidence >= CONFIDENCE.FEW_MATCHES) {
    return DUPLICATE_IMPORT_STATUS.POSSIBLE_DUPLICATE;
  }

  return DUPLICATE_IMPORT_STATUS.NO_DUPLICATE;
}

function resolveRecommendation(
  status: DuplicateImportStatus,
  confidence: number,
  primarySignal: SignalMatch['primarySignal'],
): DuplicateImportRecommendation {
  switch (status) {
    case DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE:
      return DUPLICATE_IMPORT_RECOMMENDATION.BLOCK_IMPORT;
    case DUPLICATE_IMPORT_STATUS.HIGH_CONFIDENCE_DUPLICATE:
      if (confidence >= CONFIDENCE.INVOICE_NEAR_EXACT && primarySignal === 'invoice') {
        return DUPLICATE_IMPORT_RECOMMENDATION.BLOCK_IMPORT;
      }

      return DUPLICATE_IMPORT_RECOMMENDATION.SKIP_DUPLICATES;
    case DUPLICATE_IMPORT_STATUS.POSSIBLE_DUPLICATE:
      return DUPLICATE_IMPORT_RECOMMENDATION.REVIEW;
    default:
      return DUPLICATE_IMPORT_RECOMMENDATION.CONTINUE;
  }
}

function classifyRowOverlap(
  matchedRows: number,
  rowRatio: number,
): { confidence: number; reasons: readonly string[] } | null {
  if (matchedRows <= 1 && rowRatio < ROW_MAJORITY_RATIO) {
    return null;
  }

  if (rowRatio >= ROW_MAJORITY_RATIO) {
    return {
      confidence: CONFIDENCE.ROW_MAJORITY,
      reasons: [`${Math.round(rowRatio * 100)}% of rows match a completed import.`],
    };
  }

  if (rowRatio >= LARGE_OVERLAP_RATIO) {
    return {
      confidence: CONFIDENCE.LARGE_OVERLAP,
      reasons: [`Large row overlap (${Math.round(rowRatio * 100)}%) with a completed import.`],
    };
  }

  if (rowRatio >= FEW_MATCHES_RATIO && matchedRows >= MIN_ROWS_FOR_WEAK_SIGNAL) {
    return {
      confidence: CONFIDENCE.FEW_MATCHES,
      reasons: [`${matchedRows} rows overlap with a completed import.`],
    };
  }

  return null;
}

function toMatchedImport(record: ImportHistoryRecord): DuplicateImportMatchedImport {
  return {
    importId: record.importId,
    importedAt: record.importedAt,
    importedBy: record.importedBy,
    status: record.status,
  };
}

function extractInvoiceNumbers(rows: readonly ResolvedImportReviewRow[]): string[] {
  const invoices = new Set<string>();

  for (const row of rows) {
    const invoice = normalizeFingerprintInvoice(row.normalizedValues['saleNumber']);

    if (invoice) {
      invoices.add(invoice);
    }
  }

  return [...invoices].sort();
}

function intersectInvoices(
  current: ReadonlySet<string>,
  historyInvoices: readonly string[],
): string[] {
  const matches: string[] = [];

  for (const invoice of historyInvoices) {
    const normalized = normalizeFingerprintInvoice(invoice);

    if (normalized && current.has(normalized)) {
      matches.push(normalized);
    }
  }

  return matches.sort();
}

function listOverlappingFingerprints(
  currentRows: ReadonlySet<string>,
  historyRows: readonly string[],
): string[] {
  const historySet = new Set(historyRows);
  const overlap: string[] = [];

  for (const fingerprint of currentRows) {
    if (historySet.has(fingerprint)) {
      overlap.push(fingerprint);
    }
  }

  return overlap.sort();
}

function resolveProductFingerprintKey(row: ResolvedImportReviewRow): string | null {
  const matchedProductId = row.productMatchResult?.matchedProductId;

  if (matchedProductId) {
    return `id:${matchedProductId}`;
  }

  const code = normalizeFingerprintInvoice(row.normalizedValues['productCode']);

  if (code) {
    return `code:${code}`;
  }

  const name = normalizeFingerprintText(row.normalizedValues['productName']);

  if (name) {
    return `name:${name}`;
  }

  return null;
}

function normalizeFingerprintText(value: NormalizedValue | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim().toLowerCase();

  return trimmed === '' ? null : trimmed;
}

function normalizeFingerprintInvoice(value: NormalizedValue | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim().toUpperCase();

  return trimmed === '' ? null : trimmed;
}

function normalizeFingerprintNumber(value: NormalizedValue | undefined): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (trimmed === '') {
      return null;
    }

    const parsed = Number(trimmed.replace(/,/g, ''));

    return Number.isFinite(parsed) ? String(parsed) : trimmed.toLowerCase();
  }

  return String(value);
}

function normalizeFingerprintAmount(
  values: Readonly<Record<string, NormalizedValue>>,
): string | null {
  const amount = normalizeFingerprintNumber(values['amount']);
  const sellingPrice = normalizeFingerprintNumber(values['sellingPrice']);

  return amount ?? sellingPrice;
}

function normalizeFingerprintDate(value: NormalizedValue | undefined): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date) {
    return formatDateParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
      return formatDateParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
    }
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (trimmed === '') {
      return null;
    }

    const dayFirst = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(trimmed);

    if (dayFirst) {
      return formatDateParts(Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1]));
    }

    const iso = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/.exec(trimmed);

    if (iso) {
      return formatDateParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    }

    const parsed = Date.parse(trimmed);

    if (!Number.isNaN(parsed)) {
      const date = new Date(parsed);

      return formatDateParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
    }

    return trimmed.toLowerCase();
  }

  return null;
}

function formatDateParts(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}
