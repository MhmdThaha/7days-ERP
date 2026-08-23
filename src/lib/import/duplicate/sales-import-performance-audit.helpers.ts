/**
 * Sales Import Performance Audit — shared test helpers (TEST ONLY).
 */

import { expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';

import type { ImportHistoryRecord } from '@/lib/import/duplicate';
import { DUPLICATE_IMPORT_STATUS, IMPORT_HISTORY_STATUS } from '@/lib/import/duplicate';
import {
  buildDuplicateImportFingerprints,
  buildDuplicateImportRowFingerprint,
  detectDuplicateImport as detectDuplicateImportFn,
} from '@/lib/import/duplicate/duplicate-import.service';
import {
  buildDuplicateImportReview,
  duplicateReviewSkippedRowNumbers,
} from '@/lib/import/duplicate/duplicate-import-review';
import {
  countBatchedIndexQueries,
  lookupCandidateImportIdsFromIndexBatched,
} from '@/lib/import/duplicate/import-duplicate-index-lookup.service';
import type { DuplicateCandidateLookupMeta } from '@/lib/import/duplicate/import-duplicate-index-candidate.service';
import { resolveImportHistoryForDuplicateDetection } from '@/lib/import/duplicate/import-duplicate-index-candidate.service';
import { commitSalesImportPipeline } from '@/lib/import/integration/commit-sales-import';
import { loadProductCatalogForReview } from '@/lib/import/integration/product-catalog-for-review';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { buildImportReview } from '@/lib/import/pipeline/analysis-pipeline';
import {
  buildImportReviewWithStageTimings,
  type BuildImportReviewStageTimings,
} from '@/lib/import/pipeline/build-import-review-profiler';
import { applySalesImportResolutions } from '@/lib/import/integration/sales-import-resolutions';
import type { MappingConfig } from '@/lib/import/engine/types';
import { DEFAULT_MAX_DATA_ROWS } from '@/lib/import/engine/parser';
import { prepareImportFile } from '@/lib/import/services/import.service';
import type { ProductMatchCatalogEntry } from '@/lib/import/services/product-matching.service';
import type { ImportReviewViewModelWithResolution, ResolvedImportReviewRow } from '@/lib/import/resolution/types';
import { SALES_DETAIL_REPORT } from '@/lib/import/reports/definitions';
import {
  AUTO_IMPORT_RECOMMENDATION,
  CONFIDENCE_LEVEL,
} from '@/lib/import/services/confidence-engine.service';
import { CONFLICT_ENGINE_STATUS } from '@/lib/import/services/conflict-engine.service';
import { PRODUCT_MATCH_STATUS } from '@/lib/import/services/product-matching.service';
import { importHistoryRepository } from '@/lib/repositories/import-history.repository';

export type PerformanceAuditRow = {
  history: number | '100k-synthetic';
  excelRows: number;
  mode: string;
  indexReads: number;
  historyReads: number;
  candidates: number;
  timeMs: number;
  listCalls: number;
  getByIdCalls: number;
  historyDocsMaterialized: number;
  note?: string;
};

export const PERFORMANCE_AUDIT_ROWS: PerformanceAuditRow[] = [];

export function assertEmulatorTestEnvironment(): void {
  expect(process.env.FIRESTORE_EMULATOR_HOST, 'Must use Firestore emulator').toBeTruthy();
  expect(process.env.FIREBASE_ADMIN_PRIVATE_KEY, 'Production private key must not be loaded').toBeUndefined();
  expect(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'Production credentials must not be loaded').toBeUndefined();
  expect(process.env.FIREBASE_ADMIN_PROJECT_ID, 'Production admin project must not be set').toBeUndefined();
  expect(process.env.GCLOUD_PROJECT ?? 'demo').not.toBe('days-bakery-erp-dev');
}

/** Synthetic/in-memory audit — no emulator required, but must not use production credentials. */
export function assertSyntheticTestEnvironment(): void {
  expect(process.env.FIREBASE_ADMIN_PRIVATE_KEY, 'Production private key must not be loaded').toBeUndefined();
  expect(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'Production credentials must not be loaded').toBeUndefined();
  expect(process.env.FIREBASE_ADMIN_PROJECT_ID, 'Production admin project must not be set').toBeUndefined();
  expect(process.env.GCLOUD_PROJECT ?? 'test').not.toBe('days-bakery-erp-dev');
}

export async function emulatorIsReachable(): Promise<boolean> {
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';

  try {
    const response = await fetch(`http://${host}/`);
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

export function buildAuditRow(
  rowNumber: number,
  values: Record<string, unknown>,
  overrides: Partial<ResolvedImportReviewRow> = {},
): ResolvedImportReviewRow {
  return {
    rowNumber,
    originalValues: values,
    normalizedValues: values as ResolvedImportReviewRow['normalizedValues'],
    reportDetectionResult: {
      profile: SALES_DETAIL_REPORT,
      reportType: 'sales-detail',
      confidence: 0.9,
      matchedColumns: [],
      missingColumns: [],
      matchedHeaders: [],
      missingHeaders: [],
      unmatchedHeaders: [],
      explanation: [],
      candidates: [],
    },
    productMatchResult: {
      status: PRODUCT_MATCH_STATUS.MATCHED,
      matchedProductId: 'prod-bread',
      matchedProductName: 'Bread',
      confidence: 98,
      reason: 'Exact Name Match',
    },
    conflictEngineResult: {
      status: CONFLICT_ENGINE_STATUS.READY,
      conflicts: [],
      warnings: [],
      blockingReason: null,
      recommendedAction: null,
      confidencePenalty: 0,
    },
    confidenceResult: {
      confidenceScore: 90,
      confidenceLevel: CONFIDENCE_LEVEL.HIGH,
      confidenceReasons: [],
      autoImportRecommendation: AUTO_IMPORT_RECOMMENDATION.PREVIEW_FIRST,
    },
    ...overrides,
  };
}

export function buildAuditReview(rows: ResolvedImportReviewRow[]): ImportReviewViewModelWithResolution {
  return {
    overview: {
      fileName: 'audit-sales.csv',
      detectedReportName: 'Sales Detail',
      detectedReportType: 'sales-detail',
      reportConfidence: 0.9,
      headerRowIndex: 0,
      totalRows: rows.length,
      readyRows: rows.length,
      warningRows: 0,
      errorRows: 0,
      averageConfidence: 90,
      autoImportEligibleRows: rows.length,
      blockedRows: 0,
    },
    reportSummary: {
      matchedColumns: [],
      missingRequiredColumns: [],
      extraColumns: [],
      unknownHeaders: [],
      detectionReasons: [],
    },
    rows,
  };
}

export function buildExcelRows(
  count: number,
  prefix: string,
  numbered = true,
): ResolvedImportReviewRow[] {
  return Array.from({ length: count }, (_, index) =>
    buildAuditRow(index + 2, {
      saleDate: '2026-08-21',
      customerName: `Audit Store ${index % 100}`,
      productName: 'Bread',
      quantity: 1 + (index % 5),
      ...(numbered ? { saleNumber: `${prefix}-${index}` } : {}),
    }),
  );
}

export function rowFingerprintFromValues(values: Record<string, unknown>): string {
  return buildDuplicateImportRowFingerprint({
    rowNumber: 2,
    originalValues: values,
    normalizedValues: values as never,
    reportDetectionResult: {} as never,
    productMatchResult: { matchedProductId: 'prod-bread' } as never,
    conflictEngineResult: {} as never,
    confidenceResult: {} as never,
  });
}

export function lightweightHistoryRecord(
  importId: string,
  invoiceNumber: string,
  rowFingerprint: string,
  fileFingerprint: string,
): ImportHistoryRecord {
  return {
    importId,
    importedAt: '2026-08-21T10:00:00.000Z',
    importedBy: 'audit@test.local',
    reportType: 'sales-detail',
    rowCount: 1,
    fileFingerprint,
    invoiceNumbers: [invoiceNumber],
    rowFingerprints: [rowFingerprint],
    status: IMPORT_HISTORY_STATUS.COMPLETED,
  };
}

export type HistoryRepositoryProbe = {
  listCalls: number;
  getByIdCalls: number;
  hasAnyCalls: number;
  historyDocsMaterialized: number;
  restore: () => void;
};

export function probeImportHistoryRepository(): HistoryRepositoryProbe {
  const probe: HistoryRepositoryProbe = {
    listCalls: 0,
    getByIdCalls: 0,
    hasAnyCalls: 0,
    historyDocsMaterialized: 0,
    restore: () => undefined,
  };

  const originalList = importHistoryRepository.list;
  const originalGetById = importHistoryRepository.getById;
  const originalHasAny = importHistoryRepository.hasAny;

  const listProbe = vi.spyOn(importHistoryRepository, 'list').mockImplementation(async (orgId) => {
    probe.listCalls += 1;
    const records = await originalList.call(importHistoryRepository, orgId);
    probe.historyDocsMaterialized += records.length;
    return records;
  });

  const getByIdProbe = vi.spyOn(importHistoryRepository, 'getById').mockImplementation(async (orgId, importId) => {
    probe.getByIdCalls += 1;
    const record = await originalGetById.call(importHistoryRepository, orgId, importId);
    if (record) {
      probe.historyDocsMaterialized += 1;
    }
    return record;
  });

  const hasAnyProbe = vi.spyOn(importHistoryRepository, 'hasAny').mockImplementation(async (orgId) => {
    probe.hasAnyCalls += 1;
    return originalHasAny.call(importHistoryRepository, orgId);
  });

  probe.restore = () => {
    listProbe.mockRestore();
    getByIdProbe.mockRestore();
    hasAnyProbe.mockRestore();
  };

  return probe;
}

export function recordAuditRow(
  row: Omit<PerformanceAuditRow, 'listCalls' | 'getByIdCalls' | 'historyDocsMaterialized'> &
    Partial<Pick<PerformanceAuditRow, 'listCalls' | 'getByIdCalls' | 'historyDocsMaterialized'>>,
): PerformanceAuditRow {
  const entry: PerformanceAuditRow = {
    listCalls: row.listCalls ?? 0,
    getByIdCalls: row.getByIdCalls ?? 0,
    historyDocsMaterialized: row.historyDocsMaterialized ?? row.historyReads,
    history: row.history,
    excelRows: row.excelRows,
    mode: row.mode,
    indexReads: row.indexReads,
    historyReads: row.historyReads,
    candidates: row.candidates,
    timeMs: row.timeMs,
    note: row.note,
  };

  PERFORMANCE_AUDIT_ROWS.push(entry);

  return entry;
}

export function historyReadsFromProbe(probe: HistoryRepositoryProbe): number {
  return probe.historyDocsMaterialized;
}

export function metaMode(meta: DuplicateCandidateLookupMeta): string {
  if (meta.source === 'index' || meta.source === 'index-empty') {
    return 'complete';
  }

  if (meta.source === 'fallback-incomplete' || meta.source === 'fallback-repairing') {
    return 'incomplete';
  }

  if (meta.source === 'fallback-error') {
    return 'index-failure';
  }

  return meta.source;
}

// --- Large Excel performance audit helpers (TEST ONLY) ---

export const LARGE_EXCEL_PROJECT = 'demo-bakeryos-large-import-performance';

export type LargeExcelStageTimings = {
  parseMs: number;
  reviewMs: number;
  fingerprintMs: number;
  indexLookupMs: number;
  resolveHistoryMs: number;
  duplicateDetectMs: number;
  chunkWriteMs: number;
  totalMs: number;
};

export type LargeExcelPerfRow = {
  excelRows: number;
  historyImports: number;
  indexState: 'complete' | 'incomplete';
  uniqueInvoices: number;
  uniqueRowFingerprints: number;
  indexQueryCount: number;
  expectedIndexQueries: number;
  historyDocsRead: number;
  candidateCount: number;
  heapDeltaMb: number;
  mainDocBytes: number;
  chunkCount: number;
  largestChunkBytes: number;
  duplicateStatus: string;
  timings: LargeExcelStageTimings;
  note?: string;
};

export const LARGE_EXCEL_PERF_ROWS: LargeExcelPerfRow[] = [];

export const LARGE_EXCEL_SALE_MAPPING: MappingConfig = {
  columnMappings: [
    { sourceHeader: 'Date', targetField: 'saleDate' },
    { sourceHeader: 'Party Name', targetField: 'customerName' },
    { sourceHeader: 'Item Name', targetField: 'productName' },
    { sourceHeader: 'Item Code', targetField: 'productCode' },
    { sourceHeader: 'Qty', targetField: 'quantity' },
    { sourceHeader: 'Invoice No', targetField: 'saleNumber' },
  ],
};

export const LARGE_EXCEL_BREAD_CATALOG: ProductMatchCatalogEntry[] = [
  {
    id: 'prod-bread',
    name: 'Milk Bread',
    code: 'BRD-001',
    unit: 'pcs',
    isActive: true,
    deletedAt: null,
  },
];

export function buildSalesDetailXlsx(rowCount: number): Uint8Array {
  const headers = ['Date', 'Party Name', 'Item Name', 'Item Code', 'Qty', 'Invoice No'];
  const rows: unknown[][] = [headers];

  for (let index = 0; index < rowCount; index += 1) {
    rows.push([
      '2026-08-21',
      `Store ${index % 200}`,
      'Milk Bread',
      'BRD-001',
      1 + (index % 5),
      `INV-LRG-${index}`,
    ]);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sales');

  return new Uint8Array(XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }));
}

export function runParseStage(rowCount: number): { parseMs: number; parsedRowCount: number } {
  const bytes = buildSalesDetailXlsx(rowCount);
  const started = performance.now();
  const prepared = prepareImportFile(bytes, 'sale', {
    fileName: 'large-sales.xlsx',
    maxRows: rowCount + 1,
  });
  return {
    parseMs: Math.round(performance.now() - started),
    parsedRowCount: prepared.parsed.rows.length,
  };
}

export function runReviewStage(rowCount: number): { reviewMs: number; resolvedRowCount: number } {
  const bytes = buildSalesDetailXlsx(rowCount);
  const prepared = prepareImportFile(bytes, 'sale', {
    fileName: 'large-sales.xlsx',
    maxRows: rowCount + 1,
  });
  const started = performance.now();
  const { viewModel } = buildImportReview({
    fileName: 'large-sales.xlsx',
    entityType: 'sale',
    parsed: prepared.parsed,
    headerDetection: prepared.headerDetection,
    reportDetection: prepared.reportDetection,
    mapping: LARGE_EXCEL_SALE_MAPPING,
    productCatalog: LARGE_EXCEL_BREAD_CATALOG,
  });

  const resolutions = viewModel.rows.map((row) => ({
    rowNumber: row.rowNumber,
    action: 'select-existing' as const,
    selectedProductId: 'prod-bread',
  }));

  const resolved = applySalesImportResolutions(
    viewModel,
    LARGE_EXCEL_BREAD_CATALOG,
    new Map(),
    resolutions,
  );

  return {
    reviewMs: Math.round(performance.now() - started),
    resolvedRowCount: resolved.rows.length,
  };
}

export type BuildImportReviewPathProfile = {
  excelRows: number;
  catalogSize: number;
  prepareImportFileMs: number;
  buildImportReviewStages: BuildImportReviewStageTimings;
  applyResolutionsMs: number;
  totalReviewPathMs: number;
};

export function buildSyntheticProductCatalog(size: number): ProductMatchCatalogEntry[] {
  return Array.from({ length: size }, (_, index) => ({
    id: `prod-${index}`,
    name: `Product ${index}`,
    code: `PRD-${String(index).padStart(4, '0')}`,
    unit: 'pcs',
    isActive: true,
    deletedAt: null,
  }));
}

export function profileBuildImportReviewPath(
  rowCount: number,
  catalog: readonly ProductMatchCatalogEntry[] = LARGE_EXCEL_BREAD_CATALOG,
): BuildImportReviewPathProfile {
  const bytes = buildSalesDetailXlsx(rowCount);

  const parseStarted = performance.now();
  const prepared = prepareImportFile(bytes, 'sale', {
    fileName: 'large-sales.xlsx',
    maxRows: rowCount + 1,
  });
  const prepareImportFileMs = Math.round(performance.now() - parseStarted);

  const { result, stageTimings } = buildImportReviewWithStageTimings({
    fileName: 'large-sales.xlsx',
    entityType: 'sale',
    parsed: prepared.parsed,
    headerDetection: prepared.headerDetection,
    reportDetection: prepared.reportDetection,
    mapping: LARGE_EXCEL_SALE_MAPPING,
    productCatalog: catalog,
  });

  const selectedProductId = catalog[0]?.id ?? 'prod-bread';
  const resolutions = result.viewModel.rows.map((row) => ({
    rowNumber: row.rowNumber,
    action: 'select-existing' as const,
    selectedProductId,
  }));

  const resolutionsStarted = performance.now();
  applySalesImportResolutions(result.viewModel, catalog, new Map(), resolutions);
  const applyResolutionsMs = Math.round(performance.now() - resolutionsStarted);

  return {
    excelRows: rowCount,
    catalogSize: catalog.length,
    prepareImportFileMs,
    buildImportReviewStages: stageTimings,
    applyResolutionsMs,
    totalReviewPathMs: stageTimings.totalMs + applyResolutionsMs,
  };
}

export function runFingerprintStage(rowCount: number): {
  fingerprintMs: number;
  fingerprints: ReturnType<typeof buildDuplicateImportFingerprints>;
} {
  const bytes = buildSalesDetailXlsx(rowCount);
  const prepared = prepareImportFile(bytes, 'sale', {
    fileName: 'large-sales.xlsx',
    maxRows: rowCount + 1,
  });
  const { viewModel } = buildImportReview({
    fileName: 'large-sales.xlsx',
    entityType: 'sale',
    parsed: prepared.parsed,
    headerDetection: prepared.headerDetection,
    reportDetection: prepared.reportDetection,
    mapping: LARGE_EXCEL_SALE_MAPPING,
    productCatalog: LARGE_EXCEL_BREAD_CATALOG,
  });
  const resolutions = viewModel.rows.map((row) => ({
    rowNumber: row.rowNumber,
    action: 'select-existing' as const,
    selectedProductId: 'prod-bread',
  }));
  const resolved = applySalesImportResolutions(
    viewModel,
    LARGE_EXCEL_BREAD_CATALOG,
    new Map(),
    resolutions,
  );
  const started = performance.now();
  const fingerprints = buildDuplicateImportFingerprints(resolved.rows);
  return {
    fingerprintMs: Math.round(performance.now() - started),
    fingerprints,
  };
}

export async function buildResolvedReviewFromXlsx(rowCount: number) {
  const bytes = buildSalesDetailXlsx(rowCount);
  const prepared = prepareImportFile(bytes, 'sale', {
    fileName: 'large-sales.xlsx',
    maxRows: rowCount + 1,
  });
  const { viewModel } = buildImportReview({
    fileName: 'large-sales.xlsx',
    entityType: 'sale',
    parsed: prepared.parsed,
    headerDetection: prepared.headerDetection,
    reportDetection: prepared.reportDetection,
    mapping: LARGE_EXCEL_SALE_MAPPING,
    productCatalog: LARGE_EXCEL_BREAD_CATALOG,
  });
  const resolutions = viewModel.rows.map((row) => ({
    rowNumber: row.rowNumber,
    action: 'select-existing' as const,
    selectedProductId: 'prod-bread',
  }));
  return applySalesImportResolutions(viewModel, LARGE_EXCEL_BREAD_CATALOG, new Map(), resolutions);
}

export function recordLargeExcelRow(row: LargeExcelPerfRow): LargeExcelPerfRow {
  LARGE_EXCEL_PERF_ROWS.push(row);
  return row;
}

export function emptyLargeExcelTimings(): LargeExcelStageTimings {
  return {
    parseMs: 0,
    reviewMs: 0,
    fingerprintMs: 0,
    indexLookupMs: 0,
    resolveHistoryMs: 0,
    duplicateDetectMs: 0,
    chunkWriteMs: 0,
    totalMs: 0,
  };
}

export function parserRowLimit(): number {
  return DEFAULT_MAX_DATA_ROWS;
}

export async function measureIndexLookup(
  orgId: string,
  fingerprints: ReturnType<typeof buildDuplicateImportFingerprints>,
): Promise<{ indexLookupMs: number; indexQueryCount: number; candidateCount: number }> {
  const started = performance.now();
  const result = await lookupCandidateImportIdsFromIndexBatched(orgId, fingerprints);
  return {
    indexLookupMs: Math.round(performance.now() - started),
    indexQueryCount: result.indexLookupCount,
    candidateCount: result.candidateIds.size,
  };
}

export function expectedIndexQueries(
  fingerprints: ReturnType<typeof buildDuplicateImportFingerprints>,
): number {
  const uniqueInvoices = new Set(
    fingerprints.invoiceNumbers.map((value) => value.trim().toUpperCase()).filter(Boolean),
  ).size;
  const uniqueRows = new Set(fingerprints.rowFingerprints.filter(Boolean)).size;
  return countBatchedIndexQueries(uniqueInvoices, uniqueRows);
}

export { detectDuplicateImportFn as detectDuplicateImportForLargeExcelAudit };

// --- 9k real-Firebase benchmark fixture (TEST ONLY) ---

export const SALES_9K_ROW_COUNT = 9_000;
export const SALES_9K_SHEET_NAME = 'Sales';

export const SALES_9K_MAPPING: MappingConfig = {
  columnMappings: [
    { sourceHeader: 'Date', targetField: 'saleDate' },
    { sourceHeader: 'Party Name', targetField: 'customerName' },
    { sourceHeader: 'Item Name', targetField: 'productName' },
    { sourceHeader: 'Item Code', targetField: 'productCode' },
    { sourceHeader: 'Qty', targetField: 'quantity' },
    { sourceHeader: 'Rate', targetField: 'sellingPrice' },
    { sourceHeader: 'Invoice No', targetField: 'saleNumber' },
  ],
};

export const SALES_2K_ROW_COUNT = 2_000;

export function buildSalesBenchmarkXlsx(input: {
  rowCount: number;
  runId: string;
  invoicePrefix: string;
  catalog: readonly ProductMatchCatalogEntry[];
  seedInvoiceNumbers?: readonly string[];
  inFileDuplicatePairs?: number;
  maxSeedOverlapRows?: number;
}): Uint8Array {
  const headers = ['Date', 'Party Name', 'Item Name', 'Item Code', 'Qty', 'Rate', 'Invoice No'];
  const rows: unknown[][] = [headers];

  if (input.catalog.length === 0) {
    throw new Error('Catalog must contain at least one product.');
  }

  const seedInvoices = input.seedInvoiceNumbers ?? [];
  const inFileDuplicatePairs = input.inFileDuplicatePairs ?? 20;
  const maxSeedOverlapRows = input.maxSeedOverlapRows ?? 100;
  const seedOverlapRows = Math.min(seedInvoices.length, maxSeedOverlapRows);
  const uniqueRows = input.rowCount - seedOverlapRows - inFileDuplicatePairs * 2;

  if (uniqueRows < 0) {
    throw new Error(
      `Cannot build ${input.rowCount} rows with ${seedOverlapRows} seed overlap and ${inFileDuplicatePairs} duplicate pairs.`,
    );
  }

  const builtRows: Array<{
    date: string;
    customer: string;
    productName: string;
    productCode: string;
    qty: number;
    rate: number;
    invoice: string;
  }> = [];

  for (let index = 0; index < uniqueRows; index += 1) {
    const product = input.catalog[index % input.catalog.length]!;
    builtRows.push({
      date: `2026-08-${String((index % 28) + 1).padStart(2, '0')}`,
      customer: `Store ${index % 180}`,
      productName: product.name,
      productCode: product.code,
      qty: 1 + (index % 6),
      rate: 35 + (index % 40),
      invoice: `${input.invoicePrefix}-U-${index}`,
    });
  }

  for (let index = 0; index < seedOverlapRows; index += 1) {
    const product = input.catalog[(uniqueRows + index) % input.catalog.length]!;
    builtRows.push({
      date: '2026-08-15',
      customer: `Seed Store ${index % 20}`,
      productName: product.name,
      productCode: product.code,
      qty: 2,
      rate: 50,
      invoice: seedInvoices[index] ?? `${input.invoicePrefix}-SEED-${index}`,
    });
  }

  for (let pair = 0; pair < inFileDuplicatePairs; pair += 1) {
    const source = builtRows[pair * 11]!;
    builtRows.push({ ...source });
    builtRows.push({ ...source, qty: source.qty + 1 });
  }

  if (builtRows.length !== input.rowCount) {
    throw new Error(`Expected ${input.rowCount} rows, built ${builtRows.length}.`);
  }

  for (const row of builtRows) {
    rows.push([
      row.date,
      row.customer,
      row.productName,
      row.productCode,
      row.qty,
      row.rate,
      row.invoice,
    ]);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, SALES_9K_SHEET_NAME);

  return new Uint8Array(XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }));
}

export function buildSales9kXlsx(input: {
  runId: string;
  catalog: readonly ProductMatchCatalogEntry[];
  seedInvoiceNumbers?: readonly string[];
}): Uint8Array {
  return buildSalesBenchmarkXlsx({
    rowCount: SALES_9K_ROW_COUNT,
    runId: input.runId,
    invoicePrefix: `B9K-${input.runId}`,
    catalog: input.catalog,
    seedInvoiceNumbers: input.seedInvoiceNumbers,
    inFileDuplicatePairs: 20,
    maxSeedOverlapRows: 100,
  });
}

export function buildSales2kXlsx(input: {
  runId: string;
  catalog: readonly ProductMatchCatalogEntry[];
}): Uint8Array {
  return buildSalesBenchmarkXlsx({
    rowCount: SALES_2K_ROW_COUNT,
    runId: input.runId,
    invoicePrefix: `B2K-${input.runId}`,
    catalog: input.catalog,
    seedInvoiceNumbers: [],
    inFileDuplicatePairs: 20,
    maxSeedOverlapRows: 0,
  });
}

export function buildSalesSeedXlsx(input: {
  runId: string;
  catalog: readonly ProductMatchCatalogEntry[];
  rowCount?: number;
}): { bytes: Uint8Array; invoiceNumbers: string[] } {
  const rowCount = input.rowCount ?? 100;
  const headers = ['Date', 'Party Name', 'Item Name', 'Item Code', 'Qty', 'Rate', 'Invoice No'];
  const rows: unknown[][] = [headers];
  const invoiceNumbers: string[] = [];

  for (let index = 0; index < rowCount; index += 1) {
    const product = input.catalog[index % input.catalog.length]!;
    const invoice = `B9K-${input.runId}-SEED-${index}`;
    invoiceNumbers.push(invoice);
    rows.push([
      '2026-08-10',
      `Seed Store ${index % 20}`,
      product.name,
      product.code,
      2,
      48,
      invoice,
    ]);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, SALES_9K_SHEET_NAME);

  return {
    bytes: new Uint8Array(XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })),
    invoiceNumbers,
  };
}

// --- Real Firebase 9k benchmark runner (TEST ONLY) ---

/** Sole vitest entry point for the 9k real-Firebase benchmark. */
export const BENCHMARK_9K_TEST_FILE =
  'src/lib/import/duplicate/sales-import-9k-real-firebase.benchmark.test.ts';

export const BENCHMARK_9K_ENABLED = process.env.BENCHMARK_RUN_9K === '1';

const BENCHMARK_PLACEHOLDER_ORG_IDS = new Set([
  '',
  'your_dev_org_id',
  'dev-org-id',
  'org-id',
  'replace_me',
]);

export type BenchmarkPrerequisiteResult = {
  ok: boolean;
  orgId: string;
  orgIdValid: boolean;
  indexProbeOk: boolean;
  indexProbeMs: number;
  indexProbeError?: string;
};

/** Gate expensive 9k run — real org + duplicate index must work. */
export async function verifyFirebasePrerequisitesFor9kBenchmark(
  orgId: string,
): Promise<BenchmarkPrerequisiteResult> {
  const orgIdValid =
    !BENCHMARK_PLACEHOLDER_ORG_IDS.has(orgId.trim().toLowerCase()) &&
    orgId.trim().length >= 8;

  if (!orgIdValid) {
    return {
      ok: false,
      orgId,
      orgIdValid: false,
      indexProbeOk: false,
      indexProbeMs: 0,
      indexProbeError: 'DEV_ORG_ID is missing or still a placeholder',
    };
  }

  const probeStarted = performance.now();
  try {
    await getAdminFirestore()
      .collectionGroup('hits')
      .where('organizationId', '==', orgId)
      .where('invoiceHash', 'in', ['__benchmark_probe__'])
      .limit(1)
      .get();

    return {
      ok: true,
      orgId,
      orgIdValid: true,
      indexProbeOk: true,
      indexProbeMs: Math.round(performance.now() - probeStarted),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const building = message.includes('currently building');
    const missing = message.includes('requires an index');

    return {
      ok: false,
      orgId,
      orgIdValid: true,
      indexProbeOk: false,
      indexProbeMs: Math.round(performance.now() - probeStarted),
      indexProbeError: building
        ? 'Duplicate index still BUILDING — wait for Firebase Console to show Enabled'
        : missing
          ? 'Duplicate index missing — deploy firestore.indexes.json'
          : message,
    };
  }
}

export type Sales9kRealFirebaseBenchmarkReport = {
  runId: string;
  orgId: string;
  rowCount: number;
  excelPreparationSec: number;
  parseSec: number;
  reviewSec: number;
  matchingSec: number;
  duplicateCpuSec: number;
  firebaseQueriesSec: number;
  resolutionSec: number;
  commitSec: number;
  totalSec: number;
  catalogSize: number;
  matchedRows: number;
  duplicateStatus: string;
  imported: number;
  skipped: number;
  failed: number;
  mainImportId: string | null;
  written: number;
  pass: boolean;
  bottleneck?: string;
  failureStage?: string;
  note?: string;
  indexLookupError?: string;
  commitError?: string;
  seedError?: string;
};

export function loadEnvLocalForBenchmark(): void {
  const envPath = path.join(process.cwd(), '.env.local');

  if (!fs.existsSync(envPath)) {
    return;
  }

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const eq = trimmed.indexOf('=');

    if (eq === -1) {
      continue;
    }

    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();

    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

function benchmarkSec(ms: number): number {
  return Math.round((ms / 1000) * 100) / 100;
}

function catalogToMatchEntries(
  items: Awaited<ReturnType<typeof loadProductCatalogForReview>>['catalogItems'],
): ProductMatchCatalogEntry[] {
  return items.map(({ id, name, code, unit, isActive, deletedAt }) => ({
    id,
    name,
    code: code ?? '',
    unit,
    isActive,
    deletedAt,
  }));
}

/** Active products with a unique non-empty barcode/code — safe for barcode-only benchmark rows. */
function benchmarkEligibleCatalog(
  items: Awaited<ReturnType<typeof loadProductCatalogForReview>>['catalogItems'],
): ProductMatchCatalogEntry[] {
  const activeWithCode = catalogToMatchEntries(items).filter(
    (product) => product.isActive && product.code.trim() !== '',
  );
  const codeCounts = new Map<string, number>();

  for (const product of activeWithCode) {
    const key = product.code.trim().toUpperCase();
    codeCounts.set(key, (codeCounts.get(key) ?? 0) + 1);
  }

  return activeWithCode.filter(
    (product) => codeCounts.get(product.code.trim().toUpperCase()) === 1,
  );
}

function writeSynthetic9kArtifacts(input: {
  runId: string;
  bytes: Uint8Array;
  eligibleProductCount: number;
}): void {
  const testdataDir = path.join(process.cwd(), 'testdata');
  fs.mkdirSync(testdataDir, { recursive: true });
  fs.writeFileSync(
    path.join(testdataDir, 'sales-import-9k-synthetic.xlsx'),
    Buffer.from(input.bytes),
  );

  const manifest = {
    synthetic: true,
    generatedAt: new Date().toISOString(),
    runId: input.runId,
    rowCount: SALES_9K_ROW_COUNT,
    structure: 'BakeryOS sales-detail export columns',
    columns: ['Date', 'Party Name', 'Item Name', 'Item Code', 'Qty', 'Rate', 'Invoice No'],
    composition: {
      uniqueRows: SALES_9K_ROW_COUNT - 100 - 40,
      seedOverlapRows: 100,
      inFileDuplicateRows: 40,
      inFileDuplicatePairs: 20,
    },
    productSource: 'Active unique-coded products from DEV_ORG_ID catalog',
    eligibleProductCount: input.eligibleProductCount,
    seedImport: { rowCount: 100, invoicePrefix: `B9K-${input.runId}-SEED` },
    invoicePrefix: `B9K-${input.runId}`,
  };

  fs.writeFileSync(
    path.join(testdataDir, 'sales-import-9k-synthetic.manifest.json'),
    JSON.stringify(manifest, null, 2),
  );
}

export async function runSales9kRealFirebaseBenchmark(): Promise<Sales9kRealFirebaseBenchmarkReport> {
  loadEnvLocalForBenchmark();
  delete process.env.FIRESTORE_EMULATOR_HOST;

  const orgId = process.env.DEV_ORG_ID ?? '';
  const userId = process.env.DEV_USER_ID ?? '';
  const runId = process.env.BENCHMARK_9K_RUN_ID ?? Date.now().toString(36);
  const totalStart = performance.now();
  const fileName = `sales-import-9k-${runId}.xlsx`;

  let failureStage: string | undefined;
  let indexLookupError: string | undefined;
  let commitError: string | undefined;
  let seedError: string | undefined;
  let note = '';

  let excelPreparationMs = 0;
  let parseMs = 0;
  let reviewMs = 0;
  let matchingMs = 0;
  let duplicateCpuMs = 0;
  let firebaseQueriesMs = 0;
  let resolutionMs = 0;
  let commitMs = 0;
  let catalogSize = 0;
  let matchedRows = 0;
  let duplicateStatus = 'unknown';
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let mainImportId: string | null = null;
  let index = { indexLookupMs: 0, indexQueryCount: 0, candidateCount: 0 };

  const writePartialReport = (): Sales9kRealFirebaseBenchmarkReport => {
    const thresholds = {
      parseSec: 5,
      reviewSec: 10,
      matchingSec: 10,
      duplicateCpuSec: 10,
      firebaseQueriesSec: 120,
      resolutionSec: 5,
    };

    let bottleneck: string | undefined;
    const parseSec = benchmarkSec(parseMs);
    const reviewSec = benchmarkSec(reviewMs);
    const matchingSec = benchmarkSec(matchingMs);
    const duplicateCpuSec = benchmarkSec(duplicateCpuMs);
    const firebaseQueriesSec = benchmarkSec(firebaseQueriesMs);
    const resolutionSec = benchmarkSec(resolutionMs);
    const commitSec = benchmarkSec(commitMs);
    const excelPreparationSec = benchmarkSec(excelPreparationMs);
    const totalSec = benchmarkSec(performance.now() - totalStart);

    if (parseSec > thresholds.parseSec) {
      bottleneck = 'parse';
    } else if (reviewSec > thresholds.reviewSec) {
      bottleneck = 'review';
    } else if (matchingSec > thresholds.matchingSec) {
      bottleneck = 'matching';
    } else if (duplicateCpuSec > thresholds.duplicateCpuSec) {
      bottleneck = 'duplicate-cpu';
    } else if (firebaseQueriesSec > thresholds.firebaseQueriesSec) {
      bottleneck = 'firebase-queries';
    } else if (resolutionSec > thresholds.resolutionSec) {
      bottleneck = 'resolution';
    } else if (commitError && commitError !== 'skipped-by-env') {
      bottleneck = 'commit';
    }

    const report: Sales9kRealFirebaseBenchmarkReport = {
      runId,
      orgId,
      rowCount: SALES_9K_ROW_COUNT,
      excelPreparationSec,
      parseSec,
      reviewSec,
      matchingSec,
      duplicateCpuSec,
      firebaseQueriesSec,
      resolutionSec,
      commitSec,
      totalSec,
      catalogSize,
      matchedRows,
      duplicateStatus,
      imported,
      skipped,
      failed,
      written: imported,
      mainImportId,
      pass: !bottleneck && !failureStage,
      bottleneck,
      failureStage,
      indexLookupError,
      commitError,
      seedError,
      note: note || undefined,
    };

    fs.writeFileSync(
      path.join(process.cwd(), 'benchmark-9k-real-firebase-results.json'),
      JSON.stringify({ ...report, finishedAt: new Date().toISOString() }, null, 2),
    );

    return report;
  };

  let terminalError: unknown;
  let finalReport: Sales9kRealFirebaseBenchmarkReport | null = null;

  try {
    expect(process.env.FIRESTORE_EMULATOR_HOST, 'Emulator must be off').toBeUndefined();
    expect(process.env.FIREBASE_ADMIN_PROJECT_ID, 'FIREBASE_ADMIN_PROJECT_ID required').toBeTruthy();
    expect(process.env.FIREBASE_ADMIN_CLIENT_EMAIL, 'FIREBASE_ADMIN_CLIENT_EMAIL required').toBeTruthy();
    expect(process.env.FIREBASE_ADMIN_PRIVATE_KEY, 'FIREBASE_ADMIN_PRIVATE_KEY required').toBeTruthy();
    expect(orgId, 'DEV_ORG_ID required').toBeTruthy();
    expect(userId, 'DEV_USER_ID required').toBeTruthy();

    getAdminFirestore();

    const prerequisites = await verifyFirebasePrerequisitesFor9kBenchmark(orgId);
    expect(prerequisites.ok, prerequisites.indexProbeError ?? 'Firebase prerequisites invalid').toBe(true);

    const excelPrepStart = performance.now();

    const { catalogItems, stockByProductId } = await loadProductCatalogForReview(orgId);
    catalogSize = benchmarkEligibleCatalog(catalogItems).length;
    const matchCatalog = benchmarkEligibleCatalog(catalogItems);
    expect(
      matchCatalog.length,
      'Org needs active unique-coded products for barcode-matched benchmark',
    ).toBeGreaterThan(0);

    const seed = buildSalesSeedXlsx({ runId, catalog: matchCatalog, rowCount: 100 });
    let seedInvoiceNumbers = seed.invoiceNumbers;

    if (process.env.BENCHMARK_9K_SKIP_SEED !== '1') {
      try {
        const seedCommit = await commitSalesImportPipeline({
          orgId,
          userId,
          bytes: seed.bytes,
          fileName: `sales-import-9k-seed-${runId}.xlsx`,
          sheetName: SALES_9K_SHEET_NAME,
          mapping: SALES_9K_MAPPING,
          resolutions: [],
          acknowledgeDuplicateRisk: true,
        });

        if (!['success', 'partial'].includes(seedCommit.status) || (seedCommit.execution?.imported ?? 0) === 0) {
          seedInvoiceNumbers = [];
        }
      } catch (error) {
        seedError = error instanceof Error ? error.message : String(error);
        seedInvoiceNumbers = [];
        failureStage = failureStage ?? 'seed-commit';
      }
    } else {
      seedInvoiceNumbers = [];
    }

    const bytes9k = buildSales9kXlsx({
      runId,
      catalog: matchCatalog,
      seedInvoiceNumbers,
    });

    writeSynthetic9kArtifacts({ runId, bytes: bytes9k, eligibleProductCount: matchCatalog.length });
    excelPreparationMs = performance.now() - excelPrepStart;

    const parseStart = performance.now();
    const prepared = prepareImportFile(bytes9k, 'sale', {
      fileName,
      sheetName: SALES_9K_SHEET_NAME,
    });
    parseMs = performance.now() - parseStart;
    expect(prepared.parsed.rows.length).toBe(SALES_9K_ROW_COUNT);

    const { result, stageTimings } = buildImportReviewWithStageTimings({
      fileName,
      entityType: 'sale',
      parsed: prepared.parsed,
      headerDetection: prepared.headerDetection,
      reportDetection: prepared.reportDetection,
      mapping: SALES_9K_MAPPING,
      productCatalog: matchCatalog,
      stockByProductId: new Map(Object.entries(stockByProductId)),
      preparation: {},
    });

    matchingMs = stageTimings.processRowsMs;
    const duplicateInFileCpuMs = stageTimings.detectDuplicatesMs;
    reviewMs = stageTimings.totalMs - stageTimings.processRowsMs - stageTimings.detectDuplicatesMs;

    matchedRows = result.viewModel.rows.filter(
      (row) => row.productMatchResult?.status === PRODUCT_MATCH_STATUS.MATCHED,
    ).length;
    expect(matchedRows).toBe(SALES_9K_ROW_COUNT);

    const resolutionStart = performance.now();
    const resolvedReview = applySalesImportResolutions(
      result.viewModel,
      catalogItems,
      new Map(Object.entries(stockByProductId)),
      [],
    );
    resolutionMs = performance.now() - resolutionStart;

    const fingerprintStart = performance.now();
    const fingerprints = buildDuplicateImportFingerprints(resolvedReview.rows);
    const fingerprintMs = performance.now() - fingerprintStart;

    try {
      index = await measureIndexLookup(orgId, fingerprints);
    } catch (error) {
      indexLookupError = error instanceof Error ? error.message : String(error);
      failureStage = failureStage ?? 'firebase-duplicate-lookup';
    }

    const resolveHistoryStart = performance.now();
    const resolvedHistory = await resolveImportHistoryForDuplicateDetection(orgId, resolvedReview);
    const resolveHistoryMs = performance.now() - resolveHistoryStart;

    const duplicateDetectCpuStart = performance.now();
    const duplicateResult = detectDuplicateImportFn({
      resolvedReview,
      importHistory: resolvedHistory.importHistory,
    });
    const duplicateDetectCpuMs = performance.now() - duplicateDetectCpuStart;

    duplicateCpuMs = duplicateInFileCpuMs + fingerprintMs + duplicateDetectCpuMs;
    firebaseQueriesMs = index.indexLookupMs + Math.max(0, resolveHistoryMs - index.indexLookupMs);
    duplicateStatus = duplicateResult.status;

    if (seedInvoiceNumbers.length > 0) {
      expect(duplicateResult.status).not.toBe(DUPLICATE_IMPORT_STATUS.NO_DUPLICATE);
    }

    const dupReview = buildDuplicateImportReview(resolvedReview.rows, duplicateResult);
    const skippedDupRows = duplicateReviewSkippedRowNumbers(dupReview.items, new Set());

    note = `indexQueries=${index.indexQueryCount} candidates=${index.candidateCount} flaggedDupRows=${dupReview.flaggedCount} historySource=${resolvedHistory.meta.source}`;

    const commitStart = performance.now();
    if (process.env.BENCHMARK_9K_SKIP_COMMIT === '1') {
      commitMs = 0;
      commitError = 'skipped-by-env';
    } else {
      try {
        const commitResult = await commitSalesImportPipeline({
          orgId,
          userId,
          bytes: bytes9k,
          fileName,
          sheetName: SALES_9K_SHEET_NAME,
          mapping: SALES_9K_MAPPING,
          resolutions: [],
          acknowledgeDuplicateRisk: true,
          duplicateReviewSkippedRowNumbers: skippedDupRows,
        });
        commitMs = performance.now() - commitStart;

        expect(['success', 'partial']).toContain(commitResult.status);
        expect(commitResult.execution).toBeTruthy();
        imported = commitResult.execution!.imported;
        skipped = commitResult.execution!.skipped;
        failed = commitResult.execution!.failed;
        mainImportId = commitResult.execution!.importId;

        expect(imported).toBeGreaterThan(0);
        expect(imported + skipped + failed).toBeLessThanOrEqual(SALES_9K_ROW_COUNT);
      } catch (error) {
        commitMs = performance.now() - commitStart;
        commitError = error instanceof Error ? error.message : String(error);
        failureStage = failureStage ?? 'firebase-commit';
        throw error;
      }
    }
  } catch (error) {
    terminalError = error;
    if (!failureStage) {
      failureStage = 'unexpected';
    }
  } finally {
    finalReport = writePartialReport();
  }

  if (terminalError) {
    throw terminalError;
  }

  return finalReport!;
}

export type Sales2kRealFirebaseBenchmarkReport = Sales9kRealFirebaseBenchmarkReport & {
  executionSec: number;
  finalizationSec: number;
  pipelineStatus: string | null;
  verificationOk: boolean;
  verificationIssues: readonly string[];
  sourceSaleLinkCount: number;
  importHistoryStatus: string | null;
};

type ImportCorrectnessVerification = {
  ok: boolean;
  issues: string[];
  importHistoryStatus: string | null;
  sourceSaleLinkCount: number;
  rowsImportedInHistory: number;
  rowsSkippedInHistory: number;
  rowsFailedInHistory: number;
  duplicateIndexStatus: string | null;
};

async function verifyImportCorrectnessAfterCommit(input: {
  orgId: string;
  importId: string;
  runId: string;
  expectedImported: number;
  expectedSkipped: number;
  expectedFailed: number;
  invoicePrefix: string;
}): Promise<ImportCorrectnessVerification> {
  const issues: string[] = [];
  const history = await importHistoryRepository.getById(input.orgId, input.importId);

  if (!history) {
    return {
      ok: false,
      issues: [`Import history ${input.importId} was not found after commit.`],
      importHistoryStatus: null,
      sourceSaleLinkCount: 0,
      rowsImportedInHistory: 0,
      rowsSkippedInHistory: 0,
      rowsFailedInHistory: 0,
      duplicateIndexStatus: null,
    };
  }

  const sourceSales = await importHistoryRepository.listSourceSales(input.orgId, input.importId);
  const sourceSaleLinkCount = sourceSales.size;

  if (history.rowsImported !== input.expectedImported) {
    issues.push(
      `importHistory.rowsImported=${history.rowsImported} but execution reported imported=${input.expectedImported}.`,
    );
  }

  if (history.rowsSkipped !== input.expectedSkipped) {
    issues.push(
      `importHistory.rowsSkipped=${history.rowsSkipped} but execution reported skipped=${input.expectedSkipped}.`,
    );
  }

  if (history.rowsFailed !== input.expectedFailed) {
    issues.push(
      `importHistory.rowsFailed=${history.rowsFailed} but execution reported failed=${input.expectedFailed}.`,
    );
  }

  if (sourceSaleLinkCount !== input.expectedImported) {
    issues.push(
      `sourceSales link count=${sourceSaleLinkCount} but imported row count=${input.expectedImported}.`,
    );
  }

  const acceptableStatuses = new Set<string>([
    IMPORT_HISTORY_STATUS.COMPLETED,
    IMPORT_HISTORY_STATUS.IMPORTED,
  ]);

  if (!acceptableStatuses.has(history.status)) {
    issues.push(`importHistory.status=${history.status} (expected COMPLETED or IMPORTED).`);
  }

  if (input.expectedImported > 0 && history.saleIds.length === 0) {
    issues.push('importHistory.saleIds is empty despite imported rows.');
  }

  if (history.saleIds.length !== sourceSaleLinkCount) {
    issues.push(
      `importHistory.saleIds length=${history.saleIds.length} differs from sourceSales=${sourceSaleLinkCount}.`,
    );
  }

  const firestore = getAdminFirestore();
  const salesSnap = await firestore
    .collection('organizations')
    .doc(input.orgId)
    .collection('sales')
    .where('importId', '==', input.importId)
    .get();

  if (salesSnap.size !== input.expectedImported) {
    issues.push(
      `sales with importId=${salesSnap.size} but expected ${input.expectedImported} imported rows.`,
    );
  }

  const invoicePrefix = `${input.invoicePrefix}-U-`;
  const duplicateInvoices = new Map<string, number>();

  for (const doc of salesSnap.docs) {
    const saleNumber = String(doc.data().saleNumber ?? '');

    if (saleNumber.startsWith(invoicePrefix)) {
      duplicateInvoices.set(saleNumber, (duplicateInvoices.get(saleNumber) ?? 0) + 1);
    }
  }

  const unexpectedDuplicateInvoices = [...duplicateInvoices.entries()].filter(([, count]) => count > 1);

  if (unexpectedDuplicateInvoices.length > 0) {
    issues.push(
      `Unexpected duplicate sale numbers for this run: ${unexpectedDuplicateInvoices
        .slice(0, 5)
        .map(([invoice, count]) => `${invoice}×${count}`)
        .join(', ')}.`,
    );
  }

  return {
    ok: issues.length === 0,
    issues,
    importHistoryStatus: history.status,
    sourceSaleLinkCount,
    rowsImportedInHistory: history.rowsImported,
    rowsSkippedInHistory: history.rowsSkipped,
    rowsFailedInHistory: history.rowsFailed,
    duplicateIndexStatus: history.duplicateIndexStatus ?? null,
  };
}

function writeSynthetic2kArtifacts(input: {
  runId: string;
  bytes: Uint8Array;
  eligibleProductCount: number;
}): void {
  const testdataDir = path.join(process.cwd(), 'testdata');
  fs.mkdirSync(testdataDir, { recursive: true });
  fs.writeFileSync(
    path.join(testdataDir, 'sales-import-2k-synthetic.xlsx'),
    Buffer.from(input.bytes),
  );

  const manifest = {
    synthetic: true,
    generatedAt: new Date().toISOString(),
    runId: input.runId,
    rowCount: SALES_2K_ROW_COUNT,
    structure: 'BakeryOS sales-detail export columns',
    columns: ['Date', 'Party Name', 'Item Name', 'Item Code', 'Qty', 'Rate', 'Invoice No'],
    composition: {
      uniqueRows: SALES_2K_ROW_COUNT - 40,
      seedOverlapRows: 0,
      inFileDuplicateRows: 40,
      inFileDuplicatePairs: 20,
    },
    productSource: 'Active unique-coded products from DEV_ORG_ID catalog',
    eligibleProductCount: input.eligibleProductCount,
    seedImport: null,
    invoicePrefix: `B2K-${input.runId}`,
  };

  fs.writeFileSync(
    path.join(testdataDir, 'sales-import-2k-synthetic.manifest.json'),
    JSON.stringify(manifest, null, 2),
  );
}

/** Controlled 2k real-Firebase acceptance test — full production commit pipeline, no seed import. */
export async function runSales2kRealFirebaseBenchmark(): Promise<Sales2kRealFirebaseBenchmarkReport> {
  loadEnvLocalForBenchmark();
  delete process.env.FIRESTORE_EMULATOR_HOST;

  const orgId = process.env.DEV_ORG_ID ?? '';
  const userId = process.env.DEV_USER_ID ?? '';
  const runId = process.env.BENCHMARK_2K_RUN_ID ?? `b2k-${Date.now().toString(36)}`;
  const invoicePrefix = `B2K-${runId}`;
  const totalStart = performance.now();
  const fileName = `sales-import-2k-${runId}.xlsx`;

  let failureStage: string | undefined;
  let indexLookupError: string | undefined;
  let commitError: string | undefined;
  let note = '';

  let excelPreparationMs = 0;
  let parseMs = 0;
  let reviewMs = 0;
  let matchingMs = 0;
  let duplicateCpuMs = 0;
  let firebaseQueriesMs = 0;
  let resolutionMs = 0;
  let commitMs = 0;
  let executionMs = 0;
  let finalizationMs = 0;
  let catalogSize = 0;
  let matchedRows = 0;
  let duplicateStatus = 'unknown';
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let mainImportId: string | null = null;
  let pipelineStatus: string | null = null;
  let index = { indexLookupMs: 0, indexQueryCount: 0, candidateCount: 0 };
  let verificationOk = false;
  let verificationIssues: string[] = [];
  let sourceSaleLinkCount = 0;
  let importHistoryStatus: string | null = null;

  const writePartialReport = (): Sales2kRealFirebaseBenchmarkReport => {
    const thresholds = {
      parseSec: 3,
      reviewSec: 5,
      matchingSec: 5,
      duplicateCpuSec: 5,
      firebaseQueriesSec: 60,
      resolutionSec: 3,
    };

    let bottleneck: string | undefined;
    const parseSec = benchmarkSec(parseMs);
    const reviewSec = benchmarkSec(reviewMs);
    const matchingSec = benchmarkSec(matchingMs);
    const duplicateCpuSec = benchmarkSec(duplicateCpuMs);
    const firebaseQueriesSec = benchmarkSec(firebaseQueriesMs);
    const resolutionSec = benchmarkSec(resolutionMs);
    const commitSec = benchmarkSec(commitMs);
    const executionSec = benchmarkSec(executionMs);
    const finalizationSec = benchmarkSec(finalizationMs);
    const excelPreparationSec = benchmarkSec(excelPreparationMs);
    const totalSec = benchmarkSec(performance.now() - totalStart);

    const stageEntries: Array<[string, number]> = [
      ['excel-preparation', excelPreparationSec],
      ['parse', parseSec],
      ['review', reviewSec],
      ['matching', matchingSec],
      ['duplicate-cpu', duplicateCpuSec],
      ['firebase-queries', firebaseQueriesSec],
      ['resolution', resolutionSec],
      ['commit-total', commitSec],
      ['execution', executionSec],
      ['finalization', finalizationSec],
    ];
    const slowest = stageEntries.reduce((best, entry) => (entry[1] > best[1] ? entry : best));

    if (parseSec > thresholds.parseSec) {
      bottleneck = 'parse';
    } else if (reviewSec > thresholds.reviewSec) {
      bottleneck = 'review';
    } else if (matchingSec > thresholds.matchingSec) {
      bottleneck = 'matching';
    } else if (duplicateCpuSec > thresholds.duplicateCpuSec) {
      bottleneck = 'duplicate-cpu';
    } else if (firebaseQueriesSec > thresholds.firebaseQueriesSec) {
      bottleneck = 'firebase-queries';
    } else if (resolutionSec > thresholds.resolutionSec) {
      bottleneck = 'resolution';
    } else if (commitError) {
      bottleneck = 'commit';
    } else {
      bottleneck = slowest[0];
    }

    const pass =
      !failureStage &&
      !commitError &&
      verificationOk &&
      ['success', 'partial'].includes(pipelineStatus ?? '') &&
      imported > 0;

    const report: Sales2kRealFirebaseBenchmarkReport = {
      runId,
      orgId,
      rowCount: SALES_2K_ROW_COUNT,
      excelPreparationSec,
      parseSec,
      reviewSec,
      matchingSec,
      duplicateCpuSec,
      firebaseQueriesSec,
      resolutionSec,
      commitSec,
      executionSec,
      finalizationSec,
      totalSec,
      catalogSize,
      matchedRows,
      duplicateStatus,
      imported,
      skipped,
      failed,
      written: imported,
      mainImportId,
      pipelineStatus,
      pass,
      bottleneck,
      failureStage,
      indexLookupError,
      commitError,
      verificationOk,
      verificationIssues,
      sourceSaleLinkCount,
      importHistoryStatus,
      note: note || undefined,
    };

    fs.writeFileSync(
      path.join(process.cwd(), 'benchmark-2k-real-firebase-results.json'),
      JSON.stringify({ ...report, finishedAt: new Date().toISOString() }, null, 2),
    );

    return report;
  };

  let terminalError: unknown;
  let finalReport: Sales2kRealFirebaseBenchmarkReport | null = null;

  try {
    expect(process.env.FIRESTORE_EMULATOR_HOST, 'Emulator must be off').toBeUndefined();
    expect(process.env.FIREBASE_ADMIN_PROJECT_ID, 'FIREBASE_ADMIN_PROJECT_ID required').toBeTruthy();
    expect(process.env.FIREBASE_ADMIN_CLIENT_EMAIL, 'FIREBASE_ADMIN_CLIENT_EMAIL required').toBeTruthy();
    expect(process.env.FIREBASE_ADMIN_PRIVATE_KEY, 'FIREBASE_ADMIN_PRIVATE_KEY required').toBeTruthy();
    expect(orgId, 'DEV_ORG_ID required').toBeTruthy();
    expect(userId, 'DEV_USER_ID required').toBeTruthy();

    getAdminFirestore();

    const prerequisites = await verifyFirebasePrerequisitesFor9kBenchmark(orgId);
    expect(prerequisites.ok, prerequisites.indexProbeError ?? 'Firebase prerequisites invalid').toBe(true);

    const excelPrepStart = performance.now();

    const { catalogItems, stockByProductId } = await loadProductCatalogForReview(orgId);
    catalogSize = benchmarkEligibleCatalog(catalogItems).length;
    const matchCatalog = benchmarkEligibleCatalog(catalogItems);
    expect(
      matchCatalog.length,
      'Org needs active unique-coded products for barcode-matched benchmark',
    ).toBeGreaterThan(0);

    const bytes2k = buildSales2kXlsx({ runId, catalog: matchCatalog });
    writeSynthetic2kArtifacts({ runId, bytes: bytes2k, eligibleProductCount: matchCatalog.length });
    excelPreparationMs = performance.now() - excelPrepStart;

    const parseStart = performance.now();
    const prepared = prepareImportFile(bytes2k, 'sale', {
      fileName,
      sheetName: SALES_9K_SHEET_NAME,
    });
    parseMs = performance.now() - parseStart;
    expect(prepared.parsed.rows.length).toBe(SALES_2K_ROW_COUNT);

    const { result, stageTimings } = buildImportReviewWithStageTimings({
      fileName,
      entityType: 'sale',
      parsed: prepared.parsed,
      headerDetection: prepared.headerDetection,
      reportDetection: prepared.reportDetection,
      mapping: SALES_9K_MAPPING,
      productCatalog: matchCatalog,
      stockByProductId: new Map(Object.entries(stockByProductId)),
      preparation: {},
    });

    matchingMs = stageTimings.processRowsMs;
    const duplicateInFileCpuMs = stageTimings.detectDuplicatesMs;
    reviewMs = stageTimings.totalMs - stageTimings.processRowsMs - stageTimings.detectDuplicatesMs;

    matchedRows = result.viewModel.rows.filter(
      (row) => row.productMatchResult?.status === PRODUCT_MATCH_STATUS.MATCHED,
    ).length;
    expect(matchedRows).toBe(SALES_2K_ROW_COUNT);

    const resolutionStart = performance.now();
    const resolvedReview = applySalesImportResolutions(
      result.viewModel,
      catalogItems,
      new Map(Object.entries(stockByProductId)),
      [],
    );
    resolutionMs = performance.now() - resolutionStart;

    const fingerprintStart = performance.now();
    const fingerprints = buildDuplicateImportFingerprints(resolvedReview.rows);
    const fingerprintMs = performance.now() - fingerprintStart;

    try {
      index = await measureIndexLookup(orgId, fingerprints);
    } catch (error) {
      indexLookupError = error instanceof Error ? error.message : String(error);
      failureStage = failureStage ?? 'firebase-duplicate-lookup';
    }

    const resolveHistoryStart = performance.now();
    const resolvedHistory = await resolveImportHistoryForDuplicateDetection(orgId, resolvedReview);
    const resolveHistoryMs = performance.now() - resolveHistoryStart;

    const duplicateDetectCpuStart = performance.now();
    const duplicateResult = detectDuplicateImportFn({
      resolvedReview,
      importHistory: resolvedHistory.importHistory,
    });
    const duplicateDetectCpuMs = performance.now() - duplicateDetectCpuStart;

    duplicateCpuMs = duplicateInFileCpuMs + fingerprintMs + duplicateDetectCpuMs;
    firebaseQueriesMs = index.indexLookupMs + Math.max(0, resolveHistoryMs - index.indexLookupMs);
    duplicateStatus = duplicateResult.status;

    const dupReview = buildDuplicateImportReview(resolvedReview.rows, duplicateResult);
    const skippedDupRows = duplicateReviewSkippedRowNumbers(dupReview.items, new Set());

    note = `indexQueries=${index.indexQueryCount} candidates=${index.candidateCount} flaggedDupRows=${dupReview.flaggedCount} historySource=${resolvedHistory.meta.source} seedSkipped=true`;

    const commitStart = performance.now();
    try {
      const commitResult = await commitSalesImportPipeline({
        orgId,
        userId,
        bytes: bytes2k,
        fileName,
        sheetName: SALES_9K_SHEET_NAME,
        mapping: SALES_9K_MAPPING,
        resolutions: [],
        acknowledgeDuplicateRisk: true,
        duplicateReviewSkippedRowNumbers: skippedDupRows,
      });
      commitMs = performance.now() - commitStart;
      pipelineStatus = commitResult.status;
      executionMs = commitResult.execution?.durationMs ?? 0;
      finalizationMs = commitResult.finalization?.durationMs ?? 0;

      if (!['success', 'partial'].includes(commitResult.status)) {
        commitError =
          commitResult.execution?.errors[0] ??
          commitResult.finalization?.errors[0] ??
          `Pipeline status=${commitResult.status}`;
        failureStage = failureStage ?? 'firebase-commit';
      } else {
        expect(commitResult.execution).toBeTruthy();
        imported = commitResult.execution!.imported;
        skipped = commitResult.execution!.skipped;
        failed = commitResult.execution!.failed;
        mainImportId = commitResult.execution!.importId;

        expect(imported).toBeGreaterThan(0);
        expect(imported + skipped + failed).toBeLessThanOrEqual(SALES_2K_ROW_COUNT);

        if (mainImportId) {
          const verification = await verifyImportCorrectnessAfterCommit({
            orgId,
            importId: mainImportId,
            runId,
            expectedImported: imported,
            expectedSkipped: skipped,
            expectedFailed: failed,
            invoicePrefix,
          });
          verificationOk = verification.ok;
          verificationIssues = verification.issues;
          sourceSaleLinkCount = verification.sourceSaleLinkCount;
          importHistoryStatus = verification.importHistoryStatus;

          if (!verificationOk) {
            failureStage = failureStage ?? 'post-import-verification';
            commitError = verification.issues.join(' ');
          }
        }
      }
    } catch (error) {
      commitMs = performance.now() - commitStart;
      commitError = error instanceof Error ? error.message : String(error);
      failureStage = failureStage ?? 'firebase-commit';
      throw error;
    }
  } catch (error) {
    terminalError = error;
    if (!failureStage) {
      failureStage = 'unexpected';
    }
  } finally {
    finalReport = writePartialReport();
  }

  if (terminalError) {
    throw terminalError;
  }

  return finalReport!;
}
