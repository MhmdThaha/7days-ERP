/**
 * Shared sales import review preparation — parse, map, resolve products.
 */

import 'server-only';

import { createHash } from 'node:crypto';

import type { MappingConfig } from '@/lib/import/engine/types';
import { buildImportReview } from '@/lib/import/pipeline/analysis-pipeline';
import type { SalesImportPreparationContext } from '@/lib/import/preparation/sales-import-preparation.types';
import {
  applySalesImportResolutions,
  type SalesImportResolutionInput,
} from '@/lib/import/integration/sales-import-resolutions';
import { validateSalesImportReview } from '@/lib/import/integration/validate-sales-import-review';
import { loadProductCatalogForReview } from '@/lib/import/integration/product-catalog-for-review';
import { prepareImportFile } from '@/lib/import/services/import.service';
import type { ImportReviewViewModel } from '@/lib/import/review/types';
import type { ImportReviewViewModelWithResolution } from '@/lib/import/resolution/types';
import type { ProductResolutionCatalogItem } from '@/lib/import/resolution/types';

const PREPARE_CACHE_TTL_MS = 30 * 60 * 1000;
const PREPARE_CACHE_MAX_ENTRIES = 20;

type CachedSalesImportBaseReview = {
  viewModel: ImportReviewViewModel;
  pipelineErrors: readonly number[];
  fileName: string;
  sheetName: string;
  reportType: string;
  cachedAt: number;
};

type PrepareCacheMetrics = {
  cacheHits: number;
  cacheMisses: number;
  prepareImportFileCalls: number;
  buildImportReviewCalls: number;
};

const prepareCache = new Map<string, CachedSalesImportBaseReview>();
const prepareCacheMetrics: PrepareCacheMetrics = {
  cacheHits: 0,
  cacheMisses: 0,
  prepareImportFileCalls: 0,
  buildImportReviewCalls: 0,
};

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hashImportBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const PREPARE_CACHE_ENTRY_DELIMITER = '\u0001';

function hashImportMapping(mapping: MappingConfig): string {
  const normalized = [...mapping.columnMappings]
    .map((entry) => `${entry.sourceHeader}\0${entry.targetField}`)
    .sort()
    .join(PREPARE_CACHE_ENTRY_DELIMITER);

  return hashText(normalized);
}

function fingerprintProductCatalog(
  catalogItems: readonly ProductResolutionCatalogItem[],
): string {
  const payload = catalogItems
    .map((product) => `${product.id}\0${product.name}\0${product.code ?? ''}\0${product.isActive}`)
    .sort()
    .join(PREPARE_CACHE_ENTRY_DELIMITER);

  return hashText(payload);
}

function buildPrepareCacheKey(input: {
  orgId: string;
  bytes: Uint8Array;
  sheetName?: string;
  mapping: MappingConfig;
  preparation: SalesImportPreparationContext;
  catalogFingerprint: string;
}): string {
  return [
    input.orgId,
    hashImportBytes(input.bytes),
    input.sheetName ?? '',
    hashImportMapping(input.mapping),
    hashText(JSON.stringify(input.preparation)),
    input.catalogFingerprint,
  ].join(':');
}

function readPrepareCache(cacheKey: string): CachedSalesImportBaseReview | null {
  const now = Date.now();

  for (const [key, entry] of prepareCache.entries()) {
    if (now - entry.cachedAt > PREPARE_CACHE_TTL_MS) {
      prepareCache.delete(key);
    }
  }

  const entry = prepareCache.get(cacheKey);

  if (!entry || now - entry.cachedAt > PREPARE_CACHE_TTL_MS) {
    return null;
  }

  prepareCache.delete(cacheKey);
  prepareCache.set(cacheKey, entry);
  prepareCacheMetrics.cacheHits += 1;

  return entry;
}

function writePrepareCache(
  cacheKey: string,
  entry: Omit<CachedSalesImportBaseReview, 'cachedAt'>,
): void {
  prepareCache.set(cacheKey, { ...entry, cachedAt: Date.now() });

  while (prepareCache.size > PREPARE_CACHE_MAX_ENTRIES) {
    const oldestKey = prepareCache.keys().next().value;

    if (oldestKey === undefined) {
      break;
    }

    prepareCache.delete(oldestKey);
  }
}

export function resetSalesImportPrepareCacheForTests(): void {
  prepareCache.clear();
  prepareCacheMetrics.cacheHits = 0;
  prepareCacheMetrics.cacheMisses = 0;
  prepareCacheMetrics.prepareImportFileCalls = 0;
  prepareCacheMetrics.buildImportReviewCalls = 0;
}

export function getSalesImportPrepareCacheMetricsForTests(): Readonly<PrepareCacheMetrics> {
  return { ...prepareCacheMetrics };
}

export type PrepareSalesImportBaseReviewInput = {
  orgId: string;
  bytes: Uint8Array;
  fileName: string;
  sheetName?: string;
  mapping: MappingConfig;
  preparation?: SalesImportPreparationContext;
};

export type PreparedSalesImportBaseReview = {
  viewModel: ImportReviewViewModel;
  pipelineErrors: readonly number[];
  fileName: string;
  sheetName: string;
  reportType: string;
  catalogItems: ProductResolutionCatalogItem[];
  stockByProductId: Record<string, number>;
};

export async function prepareSalesImportBaseReview(
  input: PrepareSalesImportBaseReviewInput,
): Promise<PreparedSalesImportBaseReview> {
  const preparation = input.preparation ?? {};
  const { catalogItems, stockByProductId } = await loadProductCatalogForReview(input.orgId);
  const cacheKey = buildPrepareCacheKey({
    orgId: input.orgId,
    bytes: input.bytes,
    sheetName: input.sheetName,
    mapping: input.mapping,
    preparation,
    catalogFingerprint: fingerprintProductCatalog(catalogItems),
  });

  const cached = readPrepareCache(cacheKey);

  if (cached) {
    return {
      viewModel: cached.viewModel,
      pipelineErrors: cached.pipelineErrors,
      fileName: cached.fileName,
      sheetName: cached.sheetName,
      reportType: cached.reportType,
      catalogItems,
      stockByProductId,
    };
  }

  prepareCacheMetrics.cacheMisses += 1;
  prepareCacheMetrics.prepareImportFileCalls += 1;

  const { parsed, headerDetection, reportDetection } = prepareImportFile(
    input.bytes,
    'sale',
    {
      fileName: input.fileName,
      sheetName: input.sheetName,
    },
  );

  const productCatalog = catalogItems.map(({ category: _category, ...entry }) => entry);

  prepareCacheMetrics.buildImportReviewCalls += 1;

  const { viewModel, pipelineErrors } = buildImportReview({
    fileName: input.fileName,
    entityType: 'sale',
    parsed,
    headerDetection,
    reportDetection,
    mapping: input.mapping,
    productCatalog,
    stockByProductId: new Map(Object.entries(stockByProductId)),
    preparation,
  });

  const reportType = viewModel.overview.detectedReportType;

  writePrepareCache(cacheKey, {
    viewModel,
    pipelineErrors,
    fileName: input.fileName,
    sheetName: parsed.sheetName,
    reportType,
  });

  return {
    viewModel,
    pipelineErrors,
    fileName: input.fileName,
    sheetName: parsed.sheetName,
    reportType,
    catalogItems,
    stockByProductId,
  };
}

export type PrepareSalesImportReviewInput = {
  orgId: string;
  bytes: Uint8Array;
  fileName: string;
  sheetName?: string;
  mapping: MappingConfig;
  resolutions: readonly SalesImportResolutionInput[];
  preparation?: SalesImportPreparationContext;
};

export type PreparedSalesImportReview = {
  resolvedReview: ImportReviewViewModelWithResolution;
  reportType: string;
};

export async function prepareSalesImportResolvedReview(
  input: PrepareSalesImportReviewInput,
): Promise<PreparedSalesImportReview> {
  const base = await prepareSalesImportBaseReview({
    orgId: input.orgId,
    bytes: input.bytes,
    fileName: input.fileName,
    sheetName: input.sheetName,
    mapping: input.mapping,
    preparation: input.preparation,
  });

  const resolvedReview = applySalesImportResolutions(
    base.viewModel,
    base.catalogItems,
    new Map(Object.entries(base.stockByProductId)),
    input.resolutions,
  );

  validateSalesImportReview(resolvedReview);

  return {
    resolvedReview,
    reportType: base.reportType,
  };
}
