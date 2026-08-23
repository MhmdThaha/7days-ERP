/**
 * Stage profiler for buildImportReview (TEST / diagnostics only).
 * Mirrors analysis-pipeline.ts stage boundaries without changing production behavior.
 */

import { IMPORT_DEFINITIONS, type ImportEntityType } from '@/lib/import/definitions';
import { applyMapping } from '@/lib/import/engine/mapper';
import { normalizeRows } from '@/lib/import/engine/normalizer';
import type { MappingConfig, ParsedFile } from '@/lib/import/engine/types';
import type { NormalizedMappedRow } from '@/lib/import/preparation/sales-import-preparation.types';
import type { ImportReviewViewModel } from '@/lib/import/review/types';
import type { ReportDetectionResult } from '@/lib/import/reports/types';
import { calculateImportConfidence } from '@/lib/import/services/confidence-engine.service';
import { AUTO_IMPORT_RECOMMENDATION } from '@/lib/import/services/confidence-engine.service';
import {
  classifyImportRowConflict,
  CONFLICT_ENGINE_STATUS,
  detectDuplicateRowsInFile,
  IMPORT_CONFLICT_CODE,
  type ConflictEngineResult,
} from '@/lib/import/services/conflict-engine.service';
import type { HeaderDetectionResult } from '@/lib/import/services/header-detection.service';
import {
  buildProductMatchCatalog,
  matchProduct,
  type ProductMatchCatalog,
  type ProductMatchCatalogEntry,
  type SavedProductNameMapping,
} from '@/lib/import/services/product-matching.service';
import type { PreparationRowBlockingError } from '@/lib/import/preparation/sales-money-semantics';
import { PREPARATION_MONEY_ERROR } from '@/lib/import/preparation/sales-money-semantics';
import type { PreparationRowWarning } from '@/lib/import/preparation/sales-import-preparation.types';
import { prepareSalesImport } from '@/lib/import/preparation/sales-import-preparation.service';
import type { SalesImportPreparationContext } from '@/lib/import/preparation/sales-import-preparation.types';
import type { PreparedFieldSources } from '@/lib/import/preparation/sales-import-preparation.types';
import type { BuildImportReviewInput, BuildImportReviewResult } from '@/lib/import/pipeline/analysis-pipeline';
import type { NormalizedValue, RawCellValue } from '@/lib/import/engine/types';

export type BuildImportReviewStageTimings = {
  applyMappingMs: number;
  normalizeMs: number;
  attachOriginalsMs: number;
  prepareSalesImportMs: number;
  buildCatalogMs: number;
  detectDuplicatesMs: number;
  processRowsMs: number;
  buildOverviewMs: number;
  buildReportSummaryMs: number;
  totalMs: number;
};

export type BuildImportReviewProfiledResult = {
  result: BuildImportReviewResult;
  stageTimings: BuildImportReviewStageTimings;
};

function elapsedMs(started: number): number {
  return Math.round(performance.now() - started);
}

export function buildImportReviewWithStageTimings(
  input: BuildImportReviewInput,
): BuildImportReviewProfiledResult {
  const stageStarted = performance.now();
  const definition = IMPORT_DEFINITIONS[input.entityType];

  let started = performance.now();
  const mapped = applyMapping(input.parsed, input.mapping, definition.columns);
  const applyMappingMs = elapsedMs(started);

  started = performance.now();
  const normalizedRows = normalizeRows(mapped.rows, definition.columns);
  const normalizeMs = elapsedMs(started);

  started = performance.now();
  const rowsWithOriginals = attachOriginalValues(mapped.rows, normalizedRows);
  const attachOriginalsMs = elapsedMs(started);

  let preparedRows: NormalizedMappedRow[] = rowsWithOriginals;
  let rowProvenance = new Map<number, PreparedFieldSources>();
  let rowBlockingErrors = new Map<number, PreparationRowBlockingError>();
  let rowWarnings = new Map<number, PreparationRowWarning>();
  let preparationSummary = undefined;
  let prepareSalesImportMs = 0;

  if (input.entityType === 'sale') {
    started = performance.now();
    const preparation = prepareSalesImport({
      rows: rowsWithOriginals,
      mapping: input.mapping,
      context: input.preparation ?? {},
    });
    prepareSalesImportMs = elapsedMs(started);
    preparedRows = preparation.rows;
    rowProvenance = new Map(preparation.rowProvenance);
    rowBlockingErrors = new Map(preparation.rowBlockingErrors);
    rowWarnings = new Map(preparation.rowWarnings);
    preparationSummary = preparation.summary;
  }

  started = performance.now();
  const catalog = buildProductMatchCatalog(input.productCatalog);
  const buildCatalogMs = elapsedMs(started);

  started = performance.now();
  const duplicateRows = detectDuplicateRowsInFile(
    preparedRows.map((row) => ({
      rowNumber: row.rowNumber,
      values: row.values,
    })),
  );
  const detectDuplicatesMs = elapsedMs(started);

  const pipelineErrors: number[] = [];

  started = performance.now();
  const reviewRows = preparedRows.map((row) => {
    try {
      const reviewRow = processReviewRow(row, {
        reportDetection: input.reportDetection,
        catalog,
        savedMappings: input.savedMappings,
        duplicateRowNumbers: duplicateRows.get(row.rowNumber),
        stockByProductId: input.stockByProductId,
        preparedFieldSources: rowProvenance.get(row.rowNumber),
      });

      const preparationError = rowBlockingErrors.get(row.rowNumber);
      const preparationWarning = rowWarnings.get(row.rowNumber);

      let finalRow = reviewRow;

      if (preparationWarning) {
        finalRow = applyPreparationWarning(finalRow, preparationWarning);
      }

      if (!preparationError) {
        return finalRow;
      }

      return applyPreparationBlockingError(finalRow, preparationError);
    } catch {
      pipelineErrors.push(row.rowNumber);

      return createPipelineFailureRow(row, input.reportDetection, rowProvenance.get(row.rowNumber));
    }
  });
  const processRowsMs = elapsedMs(started);

  started = performance.now();
  const overview = {
    ...buildOverview(input, reviewRows),
    preparationSummary,
  };
  const buildOverviewMs = elapsedMs(started);

  started = performance.now();
  const reportSummary = buildReportSummary(input);
  const buildReportSummaryMs = elapsedMs(started);

  const viewModel: ImportReviewViewModel = {
    overview,
    reportSummary,
    rows: reviewRows,
  };

  return {
    result: { viewModel, pipelineErrors },
    stageTimings: {
      applyMappingMs,
      normalizeMs,
      attachOriginalsMs,
      prepareSalesImportMs,
      buildCatalogMs,
      detectDuplicatesMs,
      processRowsMs,
      buildOverviewMs,
      buildReportSummaryMs,
      totalMs: elapsedMs(stageStarted),
    },
  };
}

type ProcessReviewRowContext = {
  reportDetection: ReportDetectionResult;
  catalog: ProductMatchCatalog;
  savedMappings?: SavedProductNameMapping;
  duplicateRowNumbers?: readonly number[];
  stockByProductId?: ReadonlyMap<string, number>;
  preparedFieldSources?: PreparedFieldSources;
};

function processReviewRow(row: NormalizedMappedRow, context: ProcessReviewRowContext) {
  const productMatchResult = matchProduct(
    {
      productName: readString(row.values['productName']),
      productCode: readString(row.values['productCode']),
      unit: readString(row.values['unit']),
    },
    context.catalog,
    { savedMappings: context.savedMappings },
  );

  const currentStock =
    productMatchResult.matchedProductId != null
      ? (context.stockByProductId?.get(productMatchResult.matchedProductId) ?? null)
      : null;

  const conflictEngineResult = classifyImportRowConflict(
    {
      rowNumber: row.rowNumber,
      values: row.values,
      productMatchResult,
      reportDetectionResult: context.reportDetection,
    },
    {
      duplicateRowNumbers: context.duplicateRowNumbers,
      currentStock,
    },
  );

  const confidenceResult = calculateImportConfidence({
    reportDetectionResult: context.reportDetection,
    productMatchResult,
    conflictEngineResult,
    isBlankRow: isBlankNormalizedRow(row.values),
  });

  return {
    rowNumber: row.rowNumber,
    originalValues: row.originalValues,
    normalizedValues: row.values,
    reportDetectionResult: context.reportDetection,
    productMatchResult,
    conflictEngineResult,
    confidenceResult,
    preparedFieldSources: context.preparedFieldSources,
  };
}

function applyPreparationWarning(
  reviewRow: ReturnType<typeof processReviewRow>,
  preparationWarning: PreparationRowWarning,
) {
  const conflictEngineResult: ConflictEngineResult = {
    ...reviewRow.conflictEngineResult,
    warnings: [
      ...reviewRow.conflictEngineResult.warnings,
      {
        code: IMPORT_CONFLICT_CODE.MISSING_INVOICE_NUMBER,
        message: preparationWarning.message,
        field: 'saleNumber',
      },
    ],
    status:
      reviewRow.conflictEngineResult.status === CONFLICT_ENGINE_STATUS.ERROR
        ? CONFLICT_ENGINE_STATUS.ERROR
        : CONFLICT_ENGINE_STATUS.WARNING,
  };

  const confidenceResult = calculateImportConfidence({
    reportDetectionResult: reviewRow.reportDetectionResult,
    productMatchResult: reviewRow.productMatchResult,
    conflictEngineResult,
    isBlankRow: isBlankNormalizedRow(reviewRow.normalizedValues),
  });

  return { ...reviewRow, conflictEngineResult, confidenceResult };
}

function applyPreparationBlockingError(
  reviewRow: ReturnType<typeof processReviewRow>,
  preparationError: PreparationRowBlockingError,
) {
  const conflictCode =
    preparationError.code === PREPARATION_MONEY_ERROR.ZERO_QUANTITY_WITH_AMOUNT
      ? IMPORT_CONFLICT_CODE.INVALID_QUANTITY
      : IMPORT_CONFLICT_CODE.INVALID_AMOUNT;

  const conflictEngineResult: ConflictEngineResult = {
    status: CONFLICT_ENGINE_STATUS.ERROR,
    conflicts: [
      ...reviewRow.conflictEngineResult.conflicts,
      {
        code: conflictCode,
        message: preparationError.message,
      },
    ],
    warnings: reviewRow.conflictEngineResult.warnings,
    blockingReason: preparationError.message,
    recommendedAction: null,
    confidencePenalty: Math.max(reviewRow.conflictEngineResult.confidencePenalty, 30),
  };

  const confidenceResult = calculateImportConfidence({
    reportDetectionResult: reviewRow.reportDetectionResult,
    productMatchResult: reviewRow.productMatchResult,
    conflictEngineResult,
    isBlankRow: isBlankNormalizedRow(reviewRow.normalizedValues),
  });

  return { ...reviewRow, conflictEngineResult, confidenceResult };
}

function createPipelineFailureRow(
  row: NormalizedMappedRow,
  reportDetection: ReportDetectionResult,
  preparedFieldSources?: PreparedFieldSources,
) {
  const conflictEngineResult: ConflictEngineResult = {
    status: CONFLICT_ENGINE_STATUS.ERROR,
    conflicts: [
      {
        code: IMPORT_CONFLICT_CODE.INVALID_QUANTITY,
        message: 'Pipeline failed to analyze this row.',
      },
    ],
    warnings: [],
    blockingReason: 'Pipeline failed to analyze this row.',
    recommendedAction: null,
    confidencePenalty: 100,
  };

  const confidenceResult = calculateImportConfidence({
    reportDetectionResult: reportDetection,
    productMatchResult: null,
    conflictEngineResult,
  });

  return {
    rowNumber: row.rowNumber,
    originalValues: row.originalValues,
    normalizedValues: row.values,
    reportDetectionResult: reportDetection,
    productMatchResult: null,
    conflictEngineResult,
    confidenceResult,
    preparedFieldSources,
  };
}

function buildOverview(
  input: BuildImportReviewInput,
  rows: readonly {
    conflictEngineResult: ConflictEngineResult;
    confidenceResult: { confidenceScore: number; autoImportRecommendation: string };
  }[],
): ImportReviewViewModel['overview'] {
  let readyRows = 0;
  let warningRows = 0;
  let errorRows = 0;
  let confidenceTotal = 0;
  let autoImportEligibleRows = 0;
  let blockedRows = 0;

  for (const row of rows) {
    switch (row.conflictEngineResult.status) {
      case CONFLICT_ENGINE_STATUS.READY:
        readyRows += 1;
        break;
      case CONFLICT_ENGINE_STATUS.WARNING:
        warningRows += 1;
        break;
      case CONFLICT_ENGINE_STATUS.ERROR:
        errorRows += 1;
        break;
      default:
        break;
    }

    confidenceTotal += row.confidenceResult.confidenceScore;

    if (row.confidenceResult.autoImportRecommendation === AUTO_IMPORT_RECOMMENDATION.AUTO_IMPORT) {
      autoImportEligibleRows += 1;
    }

    if (row.confidenceResult.autoImportRecommendation === AUTO_IMPORT_RECOMMENDATION.BLOCK_IMPORT) {
      blockedRows += 1;
    }
  }

  return {
    fileName: input.fileName,
    detectedReportName: input.reportDetection.profile.displayName,
    detectedReportType: input.reportDetection.reportType,
    reportConfidence: input.reportDetection.confidence,
    headerRowIndex: input.headerDetection.headerRowIndex,
    totalRows: rows.length,
    readyRows,
    warningRows,
    errorRows,
    averageConfidence: rows.length === 0 ? 0 : confidenceTotal / rows.length,
    autoImportEligibleRows,
    blockedRows,
  };
}

function buildReportSummary(input: BuildImportReviewInput): ImportReviewViewModel['reportSummary'] {
  const matchedHeaderSet = new Set(input.reportDetection.matchedHeaders);

  return {
    matchedColumns: input.reportDetection.matchedColumns.map((column) => ({
      key: column.key,
      label: column.label,
      header: column.header,
    })),
    missingRequiredColumns: input.reportDetection.missingColumns
      .filter((column) => column.required)
      .map((column) => ({
        key: column.key,
        label: column.label,
      })),
    extraColumns: input.parsed.headers.filter((header) => !matchedHeaderSet.has(header)),
    unknownHeaders: [...input.reportDetection.unmatchedHeaders],
    detectionReasons: [...input.reportDetection.explanation],
  };
}

function attachOriginalValues(
  mappedRows: readonly { rowNumber: number; values: Readonly<Record<string, RawCellValue>> }[],
  normalizedRows: readonly { rowNumber: number; values: Readonly<Record<string, NormalizedValue>> }[],
): NormalizedMappedRow[] {
  const originalsByRow = new Map(
    mappedRows.map((row) => [row.rowNumber, serializeOriginalValues(row.values)]),
  );

  return normalizedRows.map((row) => ({
    ...row,
    originalValues: originalsByRow.get(row.rowNumber) ?? {},
  }));
}

function serializeOriginalValues(
  values: Readonly<Record<string, RawCellValue>>,
): Readonly<Record<string, unknown>> {
  const serialized: Record<string, unknown> = {};

  for (const [field, value] of Object.entries(values)) {
    serialized[field] = value instanceof Date ? value.toISOString() : value;
  }

  return serialized;
}

function readString(value: NormalizedValue | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}

function isBlankNormalizedRow(values: Readonly<Record<string, NormalizedValue>>): boolean {
  return Object.values(values).every(
    (value) => value === null || value === undefined || value === '',
  );
}
