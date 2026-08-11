'use server';

import { DomainError } from '@/lib/domain/errors';
import { assertCan } from '@/lib/domain/permissions';
import { getAuthenticatedContext } from '@/lib/firebase/auth-server';
import { MAX_IMPORT_FILE_BYTES, isSupportedImportFileName } from '@/lib/import/constants';
import { getImportDefinition, type ImportEntityType } from '@/lib/import/definitions';
import { ImportEngineError } from '@/lib/import/engine/types';
import type { MappingConfig } from '@/lib/import/engine/types';
import { buildAutoMapping, type AutoMappingResult } from '@/lib/import/services/auto-mapping';
import type { ImportResolutionStrategy } from '@/lib/import/services/conflict-resolution.service';
import {
  assertImportCommitSupported,
  assertImportConflictSupported,
  assertImportLegacyCommitSupported,
  type ImportCommitOutcomeResult,
  type ImportConflictDetectionOutcome,
} from '@/lib/import/services/import-entity-handlers';
import {
  emptyImportRunReport,
  prepareImportFile,
  runImportFromParsed,
  type ImportRunReport,
} from '@/lib/import/services/import.service';
import { buildMappingReviewBundle } from '@/lib/import/services/mapping-review.service';
import { buildImportReview } from '@/lib/import/pipeline/analysis-pipeline';
import { loadProductCatalogForReview } from '@/lib/import/integration/product-catalog-for-review';
import { buildImportGuidance } from '@/lib/import/services/import-guidance.service';
import {
  buildImportDiagnostics,
  createImportDiagnosticsTimer,
} from '@/lib/import/services/import-diagnostics.service';
import { applySavedMapping } from '@/lib/import/services/saved-mapping.service';
import { listSheetNames } from '@/lib/import/services/workbook.service';
import { getFirestore } from '@/lib/repositories/base.repository';
import { importSavedMappingRepository } from '@/lib/repositories/import-saved-mapping.repository';
import type { ActionResult } from '@/lib/utils/action-result';
import type { ImportAnalysis, ImportAutoMappingSnapshot, ImportReviewBuildResult, SalesImportCommitOutcome } from '@/types/import';
import {
  commitSalesImportPipeline,
} from '@/lib/import/integration/commit-sales-import';
import type { SalesImportResolutionInput } from '@/lib/import/integration/sales-import-resolutions';
import { ImportPreparationError } from '@/lib/import/preparation/sales-import-preparation.types';
import type { SalesImportPreparationContext } from '@/lib/import/preparation/sales-import-preparation.types';

/**
 * Server actions for the import wizard. Thin orchestration only: file
 * handling and auth live here; entity-specific conflict detection and
 * commit dispatch through the import entity handler registry.
 */

type Upload = { bytes: Uint8Array; fileName: string };

export type CommitImportOptions = {
  /** When true, persist the active mapping after a successful commit. */
  saveMapping?: boolean;
  mapping?: MappingConfig;
  reportType?: string;
};

function toAutoMappingSnapshot(autoMapping: AutoMappingResult): ImportAutoMappingSnapshot {
  return {
    mappedFields: autoMapping.mappedFields,
    ambiguousMappings: autoMapping.ambiguousMappings,
    ignoredHeaders: autoMapping.ignoredHeaders,
    unmappedHeaders: autoMapping.unmappedHeaders,
  };
}

async function readUpload(formData: FormData): Promise<Upload> {
  const file = formData.get('file');

  if (!(file instanceof File)) {
    throw new DomainError('VALIDATION_ERROR', 'No file was uploaded.');
  }

  if (!isSupportedImportFileName(file.name)) {
    throw new DomainError(
      'VALIDATION_ERROR',
      'Unsupported file type. Upload a .csv, .xlsx, or .xls file.',
    );
  }

  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new DomainError(
      'VALIDATION_ERROR',
      `The file is too large. The limit is ${Math.floor(MAX_IMPORT_FILE_BYTES / (1024 * 1024))} MB.`,
    );
  }

  return { bytes: new Uint8Array(await file.arrayBuffer()), fileName: file.name };
}

/** Converts import failures into user-facing ActionResult errors.
 *  ImportEngineError messages are written for end users, so they pass
 *  through as-is instead of becoming a generic "unexpected error". */
async function wrapImportAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { success: true, data: await fn() };
  } catch (error) {
    if (error instanceof DomainError || error instanceof ImportEngineError) {
      return { success: false, error: error.message, code: error.code };
    }

    if (error instanceof ImportPreparationError) {
      return { success: false, error: error.message, code: error.code };
    }

    console.error('Unexpected import action error:', error);
    return { success: false, error: 'An unexpected error occurred. Please try again.' };
  }
}

/** Step 2 — list worksheets so the wizard can offer sheet selection. */
export async function getImportSheetsAction(
  formData: FormData,
): Promise<ActionResult<{ sheetNames: string[] }>> {
  return wrapImportAction(async () => {
    const { role } = await getAuthenticatedContext();
    assertCan(role, 'read', 'import');

    const { bytes } = await readUpload(formData);

    return { sheetNames: listSheetNames(bytes) };
  });
}

/** Step 3 — run the full import pipeline (no commit). */
export async function analyzeImportAction(
  entityType: ImportEntityType,
  formData: FormData,
  sheetName?: string,
): Promise<ActionResult<ImportAnalysis>> {
  return wrapImportAction(async () => {
    const { orgId, role } = await getAuthenticatedContext();
    assertCan(role, 'read', 'import');

    const definition = getImportDefinition(entityType);

    if (!definition) {
      throw new DomainError('VALIDATION_ERROR', `Unknown import type "${entityType}".`);
    }

    const { bytes, fileName } = await readUpload(formData);
    const timer = createImportDiagnosticsTimer();

    timer.markStageStart('header-detection');
    timer.markStageStart('report-detection');
    const { parsed, headerDetection, reportDetection } = prepareImportFile(bytes, entityType, {
      fileName,
      sheetName,
    });
    timer.markStageEnd('header-detection');
    timer.markStageEnd('report-detection');

    timer.markStageStart('auto-mapping');
    const autoMapping = buildAutoMapping(parsed.headers, definition.columns, {
      profile: reportDetection.profile,
    });
    timer.markStageEnd('auto-mapping');

    timer.markStageStart('saved-mapping');
    const savedMapping =
      reportDetection.profile.reportType === 'unknown'
        ? null
        : await importSavedMappingRepository.get(
            orgId,
            entityType,
            reportDetection.profile.reportType,
          );

    const resolved = applySavedMapping({
      headers: parsed.headers,
      columns: definition.columns,
      autoMapping,
      savedMapping,
    });
    timer.markStageEnd('saved-mapping');

    const hasInitialMapping = resolved.mapping.columnMappings.length > 0;

    if (savedMapping && hasInitialMapping) {
      await importSavedMappingRepository.touchLastUsed(
        orgId,
        entityType,
        reportDetection.profile.reportType,
      );
    }

    timer.markStageStart('validation');
    const report = hasInitialMapping
      ? runImportFromParsed(parsed, entityType, resolved.mapping)
      : emptyImportRunReport(entityType, parsed, definition.columns);
    timer.markStageEnd('validation');

    const mappingReview = buildMappingReviewBundle({
      headers: parsed.headers,
      columns: definition.columns,
      reportDetection,
      autoMapping,
      resolved,
    });

    timer.markStageStart('import-guidance');
    const guidance = buildImportGuidance({
      columns: definition.columns,
      headerDetection,
      reportDetection,
      autoMapping,
      resolved,
      report,
    });
    timer.markStageEnd('import-guidance');

    const diagnostics = buildImportDiagnostics({
      entityType,
      fileName,
      sheetName: report.sheetName,
      startedAt: timer.startedAt,
      completedAt: timer.now(),
      stageTimings: timer.getStageTimings(),
      headerDetection,
      reportDetection,
      autoMapping,
      resolved,
      report,
      guidance,
    });

    return {
      fileName,
      sheetName: report.sheetName,
      report,
      mapping: resolved.mapping,
      unmappedHeaders: hasInitialMapping ? resolved.newMappingsNeeded : [...parsed.headers],
      mappingReview,
      autoMappingSnapshot: toAutoMappingSnapshot(autoMapping),
      guidance,
      diagnostics,
    };
  });
}

/**
 * Re-runs validation with a user-edited mapping (Mapping Review continue).
 * Auto Mapping still runs for suggestions; the user's mapping drives import.
 */
export async function revalidateImportMappingAction(
  entityType: ImportEntityType,
  formData: FormData,
  mapping: MappingConfig,
  sheetName?: string,
): Promise<ActionResult<ImportAnalysis>> {
  return wrapImportAction(async () => {
    const { role } = await getAuthenticatedContext();
    assertCan(role, 'read', 'import');

    const definition = getImportDefinition(entityType);

    if (!definition) {
      throw new DomainError('VALIDATION_ERROR', `Unknown import type "${entityType}".`);
    }

    if (mapping.columnMappings.length === 0) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `None of the columns in this file were mapped to ${definition.label} fields.`,
      );
    }

    const { bytes, fileName } = await readUpload(formData);
    const timer = createImportDiagnosticsTimer();

    timer.markStageStart('header-detection');
    timer.markStageStart('report-detection');
    const { parsed, headerDetection, reportDetection } = prepareImportFile(bytes, entityType, {
      fileName,
      sheetName,
    });
    timer.markStageEnd('header-detection');
    timer.markStageEnd('report-detection');

    timer.markStageStart('auto-mapping');
    const autoMapping = buildAutoMapping(parsed.headers, definition.columns, {
      profile: reportDetection.profile,
    });
    timer.markStageEnd('auto-mapping');

    timer.markStageStart('saved-mapping');
    const resolved = applySavedMapping({
      headers: parsed.headers,
      columns: definition.columns,
      autoMapping,
      savedMapping: null,
    });
    timer.markStageEnd('saved-mapping');

    timer.markStageStart('validation');
    const report = runImportFromParsed(parsed, entityType, mapping);
    timer.markStageEnd('validation');

    const mappingReview = buildMappingReviewBundle({
      headers: parsed.headers,
      columns: definition.columns,
      reportDetection,
      autoMapping,
      resolved,
      userMapping: mapping,
    });

    timer.markStageStart('import-guidance');
    const guidance = buildImportGuidance({
      columns: definition.columns,
      headerDetection,
      reportDetection,
      autoMapping,
      resolved,
      report,
    });
    timer.markStageEnd('import-guidance');

    const diagnostics = buildImportDiagnostics({
      entityType,
      fileName,
      sheetName: report.sheetName,
      startedAt: timer.startedAt,
      completedAt: timer.now(),
      stageTimings: timer.getStageTimings(),
      headerDetection,
      reportDetection,
      autoMapping,
      resolved,
      report,
      guidance,
    });

    return {
      fileName,
      sheetName: report.sheetName,
      report,
      mapping,
      unmappedHeaders: mappingReview.viewModel.unmappedHeaders,
      mappingReview,
      autoMappingSnapshot: toAutoMappingSnapshot(autoMapping),
      guidance,
      diagnostics,
    };
  });
}

/**
 * Builds the Phase 7/8 import review view model for sales imports after mapping.
 * Runs header/report detection and buildImportReview once — no import execution.
 */
export async function buildImportReviewAction(
  entityType: ImportEntityType,
  formData: FormData,
  mapping: MappingConfig,
  sheetName?: string,
  preparation: SalesImportPreparationContext = {},
): Promise<ActionResult<ImportReviewBuildResult>> {
  return wrapImportAction(async () => {
    const { orgId, role } = await getAuthenticatedContext();
    assertCan(role, 'read', 'import');

    if (entityType !== 'sale') {
      throw new DomainError(
        'VALIDATION_ERROR',
        'The import review flow is only available for sales imports.',
      );
    }

    const definition = getImportDefinition(entityType);

    if (!definition) {
      throw new DomainError('VALIDATION_ERROR', `Unknown import type "${entityType}".`);
    }

    if (mapping.columnMappings.length === 0) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `None of the columns in this file were mapped to ${definition.label} fields.`,
      );
    }

    const { bytes, fileName } = await readUpload(formData);
    const { parsed, headerDetection, reportDetection } = prepareImportFile(bytes, entityType, {
      fileName,
      sheetName,
    });

    const { catalogItems, stockByProductId } = await loadProductCatalogForReview(orgId);

    const productCatalog = catalogItems.map(({ category: _category, ...entry }) => entry);

    const { viewModel, pipelineErrors } = buildImportReview({
      fileName,
      entityType,
      parsed,
      headerDetection,
      reportDetection,
      mapping,
      productCatalog,
      stockByProductId: new Map(Object.entries(stockByProductId)),
      preparation,
    });

    return {
      fileName,
      sheetName: parsed.sheetName,
      mapping,
      viewModel,
      catalogItems,
      stockByProductId,
      pipelineErrors,
      preparationSummary: viewModel.overview.preparationSummary,
      preparationContext: preparation,
    };
  });
}

/**
 * Commits a reviewed sales import: server-side re-parse, duplicate check,
 * draft sale creation (Phase 10A), and inventory finalization (Phase 10B).
 */
export async function commitSalesImportAction(
  formData: FormData,
  mapping: MappingConfig,
  resolutions: readonly SalesImportResolutionInput[],
  options: {
    sheetName?: string;
    acknowledgeDuplicateRisk?: boolean;
    saveMapping?: boolean;
    reportType?: string;
    preparation?: SalesImportPreparationContext;
  } = {},
): Promise<ActionResult<SalesImportCommitOutcome>> {
  return wrapImportAction(async () => {
    const { orgId, userId, role } = await getAuthenticatedContext();
    assertCan(role, 'create', 'import');

    if (mapping.columnMappings.length === 0) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'None of the columns in this file were mapped to sale fields.',
      );
    }

    const { bytes, fileName } = await readUpload(formData);
    const startedAt = Date.now();

    const result = await commitSalesImportPipeline({
      orgId,
      userId,
      bytes,
      fileName,
      sheetName: options.sheetName,
      mapping,
      resolutions,
      acknowledgeDuplicateRisk: options.acknowledgeDuplicateRisk,
      preparation: options.preparation ?? {},
    });

    if (
      options.saveMapping &&
      options.reportType &&
      options.reportType !== 'unknown' &&
      (result.status === 'success' || result.status === 'partial')
    ) {
      await importSavedMappingRepository.save(orgId, userId, {
        entity: 'sale',
        reportType: options.reportType,
        mappings: mapping.columnMappings,
        approvedFrom: 'manual',
      });
    }

    return {
      status: result.status,
      duplicateResult: result.duplicateResult,
      execution: result.execution,
      finalization: result.finalization,
      durationMs: Date.now() - startedAt,
      fileName: result.fileName,
    };
  });
}

export type CommitImportOutcome = {
  result: ImportCommitOutcomeResult;
  /** Wall-clock time the commit took, for the result screen. */
  durationMs: number;
  /** Which conflict resolution strategy was applied. */
  strategy: ImportResolutionStrategy;
};

/**
 * Pre-commit step — detect in-file duplicates and existing records.
 * Read-only: no Firestore writes. Dispatches through the entity registry.
 */
export async function detectImportConflictsAction(
  report: ImportRunReport,
): Promise<ActionResult<ImportConflictDetectionOutcome>> {
  return wrapImportAction(async () => {
    const { orgId, role } = await getAuthenticatedContext();
    assertCan(role, 'read', 'import');
    const handler = assertImportConflictSupported(report.entityType);

    return handler(report, { db: getFirestore(), orgId });
  });
}

/**
 * Commits an import after the user chooses a conflict resolution strategy.
 * Dispatches to the entity-specific commit handler.
 */
export async function commitImportWithResolutionAction(
  report: ImportRunReport,
  conflicts: ImportConflictDetectionOutcome,
  strategy: ImportResolutionStrategy,
  options: CommitImportOptions = {},
): Promise<ActionResult<CommitImportOutcome>> {
  return wrapImportAction(async () => {
    const { orgId, userId, role } = await getAuthenticatedContext();
    assertCan(role, 'create', 'import');
    const handler = assertImportCommitSupported(report.entityType);
    const startedAt = Date.now();
    const result = await handler(report, conflicts, strategy, {
      db: getFirestore(),
      orgId,
      userId,
    });

    if (
      options.saveMapping &&
      options.mapping &&
      options.reportType &&
      options.reportType !== 'unknown'
    ) {
      await importSavedMappingRepository.save(orgId, userId, {
        entity: report.entityType,
        reportType: options.reportType,
        mappings: options.mapping.columnMappings,
        approvedFrom: 'manual',
      });
    }

    return { result, durationMs: Date.now() - startedAt, strategy };
  });
}

/**
 * Commits all importable rows without conflict resolution (legacy path).
 * Prefer commitImportWithResolutionAction from the conflict review screen.
 */
export async function commitImportAction(
  report: ImportRunReport,
): Promise<ActionResult<CommitImportOutcome>> {
  return wrapImportAction(async () => {
    const { orgId, userId, role } = await getAuthenticatedContext();
    assertCan(role, 'create', 'import');
    const handler = assertImportLegacyCommitSupported(report.entityType);
    const startedAt = Date.now();
    const result = await handler(report, {
      db: getFirestore(),
      orgId,
      userId,
    });

    return { result, durationMs: Date.now() - startedAt, strategy: 'new-only' };
  });
}
