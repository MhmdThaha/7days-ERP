/**
 * Import Conflict Engine — classifies one normalized import row as READY, WARNING, or ERROR.
 *
 * Pure infrastructure: no sales creation, inventory mutation, Firestore access, or UI.
 * Consumes normalized row data, report detection, and product matching results only.
 */

import type { NormalizedValue } from '@/lib/import/engine/types';
import type { ReportDetectionResult } from '@/lib/import/reports/types';
import {
  normalizeProductMatchName,
  PRODUCT_MATCH_STATUS,
  type ProductMatchResult,
} from '@/lib/import/services/product-matching.service';

// ---------------------------------------------------------------------------
// Conflict codes & status
// ---------------------------------------------------------------------------

export const IMPORT_CONFLICT_CODE = {
  UNKNOWN_PRODUCT: 'UNKNOWN_PRODUCT',
  MULTIPLE_PRODUCTS: 'MULTIPLE_PRODUCTS',
  SYSTEM_CONFIGURATION_ERROR: 'SYSTEM_CONFIGURATION_ERROR',
  MISSING_PRODUCT_NAME: 'MISSING_PRODUCT_NAME',
  MISSING_QUANTITY: 'MISSING_QUANTITY',
  ZERO_QUANTITY: 'ZERO_QUANTITY',
  NEGATIVE_QUANTITY: 'NEGATIVE_QUANTITY',
  INVALID_QUANTITY: 'INVALID_QUANTITY',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  MISSING_SALE_DATE: 'MISSING_SALE_DATE',
  MISSING_CUSTOMER: 'MISSING_CUSTOMER',
  MISSING_INVOICE_NUMBER: 'MISSING_INVOICE_NUMBER',
  UNIT_MISMATCH: 'UNIT_MISMATCH',
  DUPLICATE_ROW_IN_FILE: 'DUPLICATE_ROW_IN_FILE',
  NEGATIVE_STOCK_WARNING: 'NEGATIVE_STOCK_WARNING',
  DUPLICATE_IMPORT_WARNING: 'DUPLICATE_IMPORT_WARNING',
  BARCODE_NAME_CONFLICT: 'BARCODE_NAME_CONFLICT',
  INACTIVE_PRODUCT: 'INACTIVE_PRODUCT',
} as const;

export type ImportConflictCode =
  (typeof IMPORT_CONFLICT_CODE)[keyof typeof IMPORT_CONFLICT_CODE];

export const CONFLICT_ENGINE_STATUS = {
  READY: 'READY',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
} as const;

export type ConflictEngineStatus =
  (typeof CONFLICT_ENGINE_STATUS)[keyof typeof CONFLICT_ENGINE_STATUS];

export type ImportConflictEntry = {
  code: ImportConflictCode;
  message: string;
  field?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ConflictEngineResult = {
  status: ConflictEngineStatus;
  /** Blocking issues — import cannot continue until resolved. */
  conflicts: readonly ImportConflictEntry[];
  /** Non-blocking issues — user should review before importing. */
  warnings: readonly ImportConflictEntry[];
  blockingReason: string | null;
  recommendedAction: string | null;
  /** Penalty points for Phase 6 confidence scoring (0–100). Not applied here. */
  confidencePenalty: number;
};

// ---------------------------------------------------------------------------
// Input & context
// ---------------------------------------------------------------------------

export type ImportRowConflictInput = {
  rowNumber: number;
  values: Readonly<Record<string, NormalizedValue>>;
  productMatchResult?: ProductMatchResult | null;
  reportDetectionResult?: ReportDetectionResult | null;
};

export type DuplicateImportMetadata = {
  priorImportId?: string;
  priorImportDate?: string;
  matchingRowNumbers?: readonly number[];
};

export type ImportRowConflictContext = {
  /** Other row numbers in the same upload with an identical fingerprint. */
  duplicateRowNumbers?: readonly number[];
  /** Catalog stock for the matched product (when known). */
  currentStock?: number | null;
  /** Metadata from a prior import run (handled in a later phase). */
  duplicateImportMetadata?: DuplicateImportMetadata | null;
  /** Override whether sale date is required (defaults from report profile). */
  requireSaleDate?: boolean;
  /** Override whether customer name is required. */
  requireCustomer?: boolean;
};

/** Extremely large quantities are flagged for review, not blocked. */
export const HUGE_QUANTITY_THRESHOLD = 1_000_000;

const BLOCKING_CODES = new Set<ImportConflictCode>([
  IMPORT_CONFLICT_CODE.UNKNOWN_PRODUCT,
  IMPORT_CONFLICT_CODE.MULTIPLE_PRODUCTS,
  IMPORT_CONFLICT_CODE.SYSTEM_CONFIGURATION_ERROR,
  IMPORT_CONFLICT_CODE.MISSING_PRODUCT_NAME,
  IMPORT_CONFLICT_CODE.MISSING_QUANTITY,
  IMPORT_CONFLICT_CODE.INVALID_QUANTITY,
  IMPORT_CONFLICT_CODE.INVALID_AMOUNT,
  IMPORT_CONFLICT_CODE.MISSING_SALE_DATE,
]);

const CONFIDENCE_PENALTIES: Readonly<Record<ImportConflictCode, number>> = {
  [IMPORT_CONFLICT_CODE.UNKNOWN_PRODUCT]: 40,
  [IMPORT_CONFLICT_CODE.MULTIPLE_PRODUCTS]: 35,
  [IMPORT_CONFLICT_CODE.SYSTEM_CONFIGURATION_ERROR]: 50,
  [IMPORT_CONFLICT_CODE.MISSING_PRODUCT_NAME]: 25,
  [IMPORT_CONFLICT_CODE.MISSING_QUANTITY]: 30,
  [IMPORT_CONFLICT_CODE.ZERO_QUANTITY]: 8,
  [IMPORT_CONFLICT_CODE.NEGATIVE_QUANTITY]: 10,
  [IMPORT_CONFLICT_CODE.INVALID_QUANTITY]: 30,
  [IMPORT_CONFLICT_CODE.INVALID_AMOUNT]: 20,
  [IMPORT_CONFLICT_CODE.MISSING_SALE_DATE]: 25,
  [IMPORT_CONFLICT_CODE.MISSING_CUSTOMER]: 5,
  [IMPORT_CONFLICT_CODE.MISSING_INVOICE_NUMBER]: 3,
  [IMPORT_CONFLICT_CODE.UNIT_MISMATCH]: 5,
  [IMPORT_CONFLICT_CODE.DUPLICATE_ROW_IN_FILE]: 10,
  [IMPORT_CONFLICT_CODE.NEGATIVE_STOCK_WARNING]: 8,
  [IMPORT_CONFLICT_CODE.DUPLICATE_IMPORT_WARNING]: 12,
  [IMPORT_CONFLICT_CODE.BARCODE_NAME_CONFLICT]: 6,
  [IMPORT_CONFLICT_CODE.INACTIVE_PRODUCT]: 12,
};

const RECOMMENDED_ACTIONS: Partial<Record<ImportConflictCode, string>> = {
  [IMPORT_CONFLICT_CODE.UNKNOWN_PRODUCT]: 'Map this row to an existing BakeryOS product or fix the file.',
  [IMPORT_CONFLICT_CODE.MULTIPLE_PRODUCTS]: 'Choose the correct product manually — the import name is too generic.',
  [IMPORT_CONFLICT_CODE.SYSTEM_CONFIGURATION_ERROR]: 'Fix duplicate master data in BakeryOS before importing.',
  [IMPORT_CONFLICT_CODE.MISSING_PRODUCT_NAME]: 'Add a product name or barcode to this row.',
  [IMPORT_CONFLICT_CODE.MISSING_QUANTITY]: 'Enter a quantity for this line item.',
  [IMPORT_CONFLICT_CODE.ZERO_QUANTITY]: 'Skip this row or update the quantity before importing.',
  [IMPORT_CONFLICT_CODE.NEGATIVE_QUANTITY]: 'Review whether this row is a return or correct the quantity.',
  [IMPORT_CONFLICT_CODE.INVALID_QUANTITY]: 'Fix the quantity value in the file.',
  [IMPORT_CONFLICT_CODE.INVALID_AMOUNT]: 'Fix the amount value in the file.',
  [IMPORT_CONFLICT_CODE.MISSING_SALE_DATE]: 'Add a sale date to this row.',
  [IMPORT_CONFLICT_CODE.MISSING_CUSTOMER]: 'Add a customer name or confirm this sale has no customer.',
  [IMPORT_CONFLICT_CODE.UNIT_MISMATCH]: 'Review the unit — import can continue after confirmation.',
  [IMPORT_CONFLICT_CODE.DUPLICATE_ROW_IN_FILE]: 'Review duplicate rows and remove or edit extras in the file.',
  [IMPORT_CONFLICT_CODE.NEGATIVE_STOCK_WARNING]: 'Review stock impact — import can continue after confirmation.',
  [IMPORT_CONFLICT_CODE.DUPLICATE_IMPORT_WARNING]: 'Review whether this data was imported previously.',
  [IMPORT_CONFLICT_CODE.BARCODE_NAME_CONFLICT]: 'Barcode match is used — review the product name difference.',
  [IMPORT_CONFLICT_CODE.INACTIVE_PRODUCT]: 'Activate the product or choose a different match before importing.',
};

// ---------------------------------------------------------------------------
// Row fingerprint (duplicate detection helper)
// ---------------------------------------------------------------------------

const FINGERPRINT_FIELDS = [
  'saleDate',
  'customerName',
  'productName',
  'productCode',
  'quantity',
  'unit',
  'amount',
  'sellingPrice',
] as const;

export function buildImportRowFingerprint(
  values: Readonly<Record<string, NormalizedValue>>,
): string {
  const parts = FINGERPRINT_FIELDS.map((field) => normalizeFingerprintValue(values[field]));

  return JSON.stringify(parts);
}

export function detectDuplicateRowsInFile(
  rows: readonly Pick<ImportRowConflictInput, 'rowNumber' | 'values'>[],
): ReadonlyMap<number, readonly number[]> {
  const groups = new Map<string, number[]>();

  for (const row of rows) {
    if (isBlankRow(row.values)) {
      continue;
    }

    const fingerprint = buildImportRowFingerprint(row.values);
    const bucket = groups.get(fingerprint) ?? [];
    bucket.push(row.rowNumber);
    groups.set(fingerprint, bucket);
  }

  const duplicates = new Map<number, readonly number[]>();

  for (const rowNumbers of groups.values()) {
    if (rowNumbers.length < 2) {
      continue;
    }

    for (const rowNumber of rowNumbers) {
      duplicates.set(
        rowNumber,
        rowNumbers.filter((candidate) => candidate !== rowNumber),
      );
    }
  }

  return duplicates;
}

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

export function classifyImportRowConflict(
  input: ImportRowConflictInput,
  context: ImportRowConflictContext = {},
): ConflictEngineResult {
  if (isBlankRow(input.values)) {
    return buildResult([], []);
  }

  const blocking: ImportConflictEntry[] = [];
  const warnings: ImportConflictEntry[] = [];

  evaluateFieldConflicts(input, context, blocking, warnings);
  evaluateProductMatchConflicts(input, blocking, warnings);
  evaluateDuplicateRowConflicts(input, context, warnings);
  evaluateStockConflicts(input, context, warnings);
  evaluateDuplicateImportConflicts(context, warnings);

  return buildResult(blocking, warnings);
}

// ---------------------------------------------------------------------------
// Evaluators
// ---------------------------------------------------------------------------

function evaluateFieldConflicts(
  input: ImportRowConflictInput,
  context: ImportRowConflictContext,
  blocking: ImportConflictEntry[],
  warnings: ImportConflictEntry[],
): void {
  const { values, reportDetectionResult } = input;

  const productName = readString(values['productName']);
  const productCode = readString(values['productCode']);

  if (!productName && !productCode) {
    blocking.push(entry(IMPORT_CONFLICT_CODE.MISSING_PRODUCT_NAME, 'Product name and barcode are missing.', 'productName'));
  } else if (!productName) {
    warnings.push(entry(IMPORT_CONFLICT_CODE.MISSING_PRODUCT_NAME, 'Product name is missing.', 'productName'));
  }

  evaluateQuantity(values, blocking, warnings);
  evaluateAmount(values, blocking);
  evaluateSaleDate(values, reportDetectionResult, context, blocking, warnings);
  evaluateCustomer(values, reportDetectionResult, context, warnings);
}

function evaluateQuantity(
  values: Readonly<Record<string, NormalizedValue>>,
  blocking: ImportConflictEntry[],
  warnings: ImportConflictEntry[],
): void {
  const raw = values['quantity'];

  if (raw === null || raw === undefined || raw === '') {
    blocking.push(entry(IMPORT_CONFLICT_CODE.MISSING_QUANTITY, 'Quantity is missing.', 'quantity'));
    return;
  }

  const quantity = parseQuantity(raw);

  if (quantity === null) {
    blocking.push(entry(IMPORT_CONFLICT_CODE.INVALID_QUANTITY, 'Quantity is not a valid number.', 'quantity'));
    return;
  }

  if (quantity === 0) {
    warnings.push(entry(IMPORT_CONFLICT_CODE.ZERO_QUANTITY, 'Quantity is zero.', 'quantity', { quantity }));
    return;
  }

  if (quantity < 0) {
    warnings.push(
      entry(IMPORT_CONFLICT_CODE.NEGATIVE_QUANTITY, 'Quantity is negative — this may be a return.', 'quantity', {
        quantity,
      }),
    );
    return;
  }

  if (quantity >= HUGE_QUANTITY_THRESHOLD) {
    warnings.push(
      entry(IMPORT_CONFLICT_CODE.INVALID_QUANTITY, 'Quantity is extremely large — review before importing.', 'quantity', {
        quantity,
        extremelyLarge: true,
      }),
    );
  }
}

function evaluateAmount(
  values: Readonly<Record<string, NormalizedValue>>,
  blocking: ImportConflictEntry[],
): void {
  const raw = values['amount'] ?? values['sellingPrice'];

  if (raw === null || raw === undefined || raw === '') {
    return;
  }

  const amount = parseQuantity(raw);

  if (amount === null) {
    blocking.push(entry(IMPORT_CONFLICT_CODE.INVALID_AMOUNT, 'Amount is not a valid number.', 'amount'));
    return;
  }

  if (amount < 0) {
    blocking.push(entry(IMPORT_CONFLICT_CODE.INVALID_AMOUNT, 'Amount cannot be negative.', 'amount', { amount }));
  }
}

function evaluateSaleDate(
  values: Readonly<Record<string, NormalizedValue>>,
  reportDetectionResult: ReportDetectionResult | null | undefined,
  context: ImportRowConflictContext,
  blocking: ImportConflictEntry[],
  warnings: ImportConflictEntry[],
): void {
  const required =
    context.requireSaleDate ??
    reportRequiresField(reportDetectionResult, 'saleDate');

  const saleDate = values['saleDate'];

  if (hasNormalizedValue(saleDate)) {
    return;
  }

  const conflict = entry(IMPORT_CONFLICT_CODE.MISSING_SALE_DATE, 'Sale date is missing.', 'saleDate');

  if (required) {
    blocking.push(conflict);
  } else {
    warnings.push(conflict);
  }
}

function evaluateCustomer(
  values: Readonly<Record<string, NormalizedValue>>,
  reportDetectionResult: ReportDetectionResult | null | undefined,
  context: ImportRowConflictContext,
  warnings: ImportConflictEntry[],
): void {
  const required =
    context.requireCustomer ??
    reportRequiresField(reportDetectionResult, 'customerName');

  if (!required) {
    return;
  }

  if (!readString(values['customerName'])) {
    warnings.push(entry(IMPORT_CONFLICT_CODE.MISSING_CUSTOMER, 'Customer name is missing.', 'customerName'));
  }
}

function evaluateProductMatchConflicts(
  input: ImportRowConflictInput,
  blocking: ImportConflictEntry[],
  warnings: ImportConflictEntry[],
): void {
  const match = input.productMatchResult;

  if (!match) {
    return;
  }

  switch (match.status) {
    case PRODUCT_MATCH_STATUS.NOT_FOUND:
      blocking.push(
        entry(IMPORT_CONFLICT_CODE.UNKNOWN_PRODUCT, match.reason || 'Product was not found in BakeryOS.', 'productName'),
      );
      break;

    case PRODUCT_MATCH_STATUS.MULTIPLE_MATCHES:
      blocking.push(
        entry(
          IMPORT_CONFLICT_CODE.MULTIPLE_PRODUCTS,
          match.reason || 'Multiple products match this row.',
          'productName',
          {
            candidates: match.candidates ?? [],
          },
        ),
      );
      break;

    case PRODUCT_MATCH_STATUS.SYSTEM_CONFIGURATION_ERROR:
      blocking.push(
        entry(
          IMPORT_CONFLICT_CODE.SYSTEM_CONFIGURATION_ERROR,
          match.reason || 'BakeryOS catalog configuration error.',
          'productCode',
        ),
      );
      break;

    case PRODUCT_MATCH_STATUS.NEEDS_CONFIRMATION:
      if (match.reason === 'Inactive Product') {
        warnings.push(
          entry(IMPORT_CONFLICT_CODE.INACTIVE_PRODUCT, 'Matched product is inactive.', 'productName', {
            matchedProductId: match.matchedProductId,
            matchedProductName: match.matchedProductName,
          }),
        );
      }
      break;

    case PRODUCT_MATCH_STATUS.MATCHED:
      evaluateBarcodeNameConflict(input, match, warnings);
      break;

    default:
      break;
  }

  for (const warning of match.warnings ?? []) {
    if (warning.code === 'UNIT_MISMATCH') {
      warnings.push(
        entry(IMPORT_CONFLICT_CODE.UNIT_MISMATCH, warning.message, 'unit', {
          importUnit: warning.importUnit,
          catalogUnit: warning.catalogUnit,
        }),
      );
    }
  }
}

function evaluateBarcodeNameConflict(
  input: ImportRowConflictInput,
  match: ProductMatchResult,
  warnings: ImportConflictEntry[],
): void {
  if (match.reason !== 'Barcode Match') {
    return;
  }

  const importName = readString(input.values['productName']);

  if (!importName || !match.matchedProductName) {
    return;
  }

  if (normalizeProductMatchName(importName) === normalizeProductMatchName(match.matchedProductName)) {
    return;
  }

  warnings.push(
    entry(
      IMPORT_CONFLICT_CODE.BARCODE_NAME_CONFLICT,
      `Barcode matched "${match.matchedProductName}" but the file name is "${importName}".`,
      'productName',
      {
        importProductName: importName,
        matchedProductName: match.matchedProductName,
        matchedProductId: match.matchedProductId,
      },
    ),
  );
}

function evaluateDuplicateRowConflicts(
  input: ImportRowConflictInput,
  context: ImportRowConflictContext,
  warnings: ImportConflictEntry[],
): void {
  const duplicates = context.duplicateRowNumbers ?? [];

  if (duplicates.length === 0) {
    return;
  }

  warnings.push(
    entry(
      IMPORT_CONFLICT_CODE.DUPLICATE_ROW_IN_FILE,
      `This row duplicates row(s) ${duplicates.join(', ')} in the uploaded file.`,
      undefined,
      {
        rowNumber: input.rowNumber,
        duplicateRowNumbers: duplicates,
      },
    ),
  );
}

function evaluateStockConflicts(
  input: ImportRowConflictInput,
  context: ImportRowConflictContext,
  warnings: ImportConflictEntry[],
): void {
  const report = input.reportDetectionResult;

  if (!report?.profile.capabilities.supportsInventory) {
    return;
  }

  const match = input.productMatchResult;

  if (
    !match?.matchedProductId ||
    match.status === PRODUCT_MATCH_STATUS.NOT_FOUND ||
    match.status === PRODUCT_MATCH_STATUS.MULTIPLE_MATCHES
  ) {
    return;
  }

  const currentStock = context.currentStock;

  if (currentStock == null) {
    return;
  }

  const quantity = parseQuantity(input.values['quantity']);

  if (quantity === null || quantity <= 0) {
    return;
  }

  const projected = currentStock - quantity;

  if (projected < 0) {
    warnings.push(
      entry(
        IMPORT_CONFLICT_CODE.NEGATIVE_STOCK_WARNING,
        `Importing ${quantity} would reduce stock below zero (current: ${currentStock}).`,
        'quantity',
        {
          currentStock,
          quantity,
          projectedStock: projected,
          matchedProductId: match.matchedProductId,
        },
      ),
    );
  }
}

function evaluateDuplicateImportConflicts(
  context: ImportRowConflictContext,
  warnings: ImportConflictEntry[],
): void {
  const metadata = context.duplicateImportMetadata;

  if (!metadata) {
    return;
  }

  warnings.push(
    entry(
      IMPORT_CONFLICT_CODE.DUPLICATE_IMPORT_WARNING,
      'This row may match data from a previous import.',
      undefined,
      { ...metadata },
    ),
  );
}

// ---------------------------------------------------------------------------
// Result assembly
// ---------------------------------------------------------------------------

function buildResult(
  blocking: readonly ImportConflictEntry[],
  warnings: readonly ImportConflictEntry[],
): ConflictEngineResult {
  const status = resolveStatus(blocking, warnings);
  const confidencePenalty = calculateConfidencePenalty(blocking, warnings);
  const primary = blocking[0] ?? warnings[0] ?? null;

  return {
    status,
    conflicts: blocking,
    warnings,
    blockingReason: blocking[0]?.message ?? null,
    recommendedAction: primary ? (RECOMMENDED_ACTIONS[primary.code] ?? null) : null,
    confidencePenalty,
  };
}

function resolveStatus(
  blocking: readonly ImportConflictEntry[],
  warnings: readonly ImportConflictEntry[],
): ConflictEngineStatus {
  if (blocking.length > 0) {
    return CONFLICT_ENGINE_STATUS.ERROR;
  }

  if (warnings.length > 0) {
    return CONFLICT_ENGINE_STATUS.WARNING;
  }

  return CONFLICT_ENGINE_STATUS.READY;
}

function calculateConfidencePenalty(
  blocking: readonly ImportConflictEntry[],
  warnings: readonly ImportConflictEntry[],
): number {
  let penalty = 0;

  for (const item of [...blocking, ...warnings]) {
    penalty += CONFIDENCE_PENALTIES[item.code] ?? 0;
  }

  return Math.min(100, Math.max(0, penalty));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function entry(
  code: ImportConflictCode,
  message: string,
  field?: string,
  metadata?: Readonly<Record<string, unknown>>,
): ImportConflictEntry {
  return { code, message, ...(field ? { field } : {}), ...(metadata ? { metadata } : {}) };
}

function readString(value: NormalizedValue | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}

function hasNormalizedValue(value: NormalizedValue | undefined): boolean {
  if (value === null || value === undefined || value === '') {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim() !== '';
  }

  return true;
}

function parseQuantity(value: NormalizedValue | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (trimmed === '') {
      return null;
    }

    const parsed = Number(trimmed.replace(/,/g, ''));

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function isBlankRow(values: Readonly<Record<string, NormalizedValue>>): boolean {
  return FINGERPRINT_FIELDS.every((field) => !hasNormalizedValue(values[field]));
}

function reportRequiresField(
  reportDetectionResult: ReportDetectionResult | null | undefined,
  fieldKey: string,
): boolean {
  if (!reportDetectionResult) {
    return false;
  }

  return reportDetectionResult.profile.requiredFields.some((field) => field.key === fieldKey);
}

function normalizeFingerprintValue(value: NormalizedValue | undefined): NormalizedValue {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    return trimmed === '' ? null : trimmed;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

function isBlockingCode(code: ImportConflictCode): boolean {
  return BLOCKING_CODES.has(code);
}

export { isBlockingCode };
