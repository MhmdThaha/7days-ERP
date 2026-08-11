import type { MappingConfig, NormalizedRow, NormalizedValue } from '@/lib/import/engine/types';

export type NormalizedMappedRow = NormalizedRow & {
  originalValues: Readonly<Record<string, unknown>>;
};

export type PreparedValueSource = 'imported' | 'user_entered' | 'derived' | 'defaulted';

/** Serializable context from wizard → review + commit. */
export type SalesImportPreparationContext = {
  /** ISO date (YYYY-MM-DD). Required when saleDate is not mapped. */
  bulkSaleDate?: string;
};

export type PreparedFieldSources = Partial<
  Record<'saleDate' | 'sellingPrice' | 'amount' | 'customerName' | 'saleNumber', PreparedValueSource>
>;

export type PreparationRowWarning = {
  code: 'MISSING_INVOICE_NUMBER';
  message: string;
};

export type SalesImportPreparationSummary = {
  bulkSaleDateApplied?: {
    value: string;
    source: 'user_entered';
    rowCount: number;
  };
};

import type { PreparationRowBlockingError } from '@/lib/import/preparation/sales-money-semantics';

export type PrepareSalesImportInput = {
  rows: readonly NormalizedMappedRow[];
  mapping: MappingConfig;
  context: SalesImportPreparationContext;
};

export type SalesPreparationState = {
  rows: NormalizedMappedRow[];
  mapping: MappingConfig;
  context: SalesImportPreparationContext;
  summary: SalesImportPreparationSummary;
  rowProvenance: Map<number, PreparedFieldSources>;
  rowBlockingErrors: Map<number, PreparationRowBlockingError>;
  rowWarnings: Map<number, PreparationRowWarning>;
};

export type PrepareSalesImportResult = {
  rows: NormalizedMappedRow[];
  summary: SalesImportPreparationSummary;
  rowProvenance: ReadonlyMap<number, PreparedFieldSources>;
  rowBlockingErrors: ReadonlyMap<number, PreparationRowBlockingError>;
  rowWarnings: ReadonlyMap<number, PreparationRowWarning>;
};

export class ImportPreparationError extends Error {
  readonly code = 'VALIDATION_ERROR' as const;

  constructor(message: string) {
    super(message);
    this.name = 'ImportPreparationError';
  }
}

export function hasNormalizedSaleDate(value: NormalizedValue | undefined): boolean {
  if (value === null || value === undefined || value === '') {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim() !== '';
  }

  return value instanceof Date && !Number.isNaN(value.getTime());
}

export function normalizedSaleDateToIso(value: NormalizedValue | undefined): string | null {
  if (!hasNormalizedSaleDate(value)) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'string') {
    return value.trim().slice(0, 10);
  }

  return null;
}

export function isoDateToNormalizedValue(isoDate: string): NormalizedValue {
  const [year, month, day] = isoDate.split('-').map(Number);

  if (!year || !month || !day) {
    throw new ImportPreparationError('bulkSaleDate must be an ISO date (YYYY-MM-DD).');
  }

  return new Date(Date.UTC(year, month - 1, day));
}
