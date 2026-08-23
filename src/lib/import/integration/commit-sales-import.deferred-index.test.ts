import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DUPLICATE_IMPORT_RECOMMENDATION,
  DUPLICATE_IMPORT_STATUS,
} from '@/lib/import/duplicate';
import { importIndexHealthService } from '@/lib/import/duplicate/import-index-repair.service';
import { IMPORT_EXECUTION_STATUS } from '@/lib/import/execution/sales-import-execution.types';
import { commitSalesImportPipeline } from '@/lib/import/integration/commit-sales-import';

vi.mock('@/lib/import/integration/prepare-sales-import-review', () => ({
  prepareSalesImportResolvedReview: vi.fn(),
}));

vi.mock('@/lib/import/duplicate/import-duplicate-index-candidate.service', () => ({
  detectDuplicateImportWithCandidateLookup: vi.fn(),
}));

vi.mock('@/lib/import/execution/sales-import-execution.service', () => ({
  executeSalesImport: vi.fn(),
}));

vi.mock('@/lib/import/finalization/inventory-finalization.service', () => ({
  finalizeSalesImportInventory: vi.fn(),
}));

vi.mock('@/lib/import/duplicate/import-index-repair.service', () => ({
  importIndexHealthService: {
    scheduleDeferredImportDuplicateIndexWrite: vi.fn(),
    recordImportIndexWrite: vi.fn(),
    persistImportDuplicateIndexForImport: vi.fn(),
  },
  importIndexRepairService: {
    scheduleRepair: vi.fn(),
  },
}));

import { prepareSalesImportResolvedReview } from '@/lib/import/integration/prepare-sales-import-review';
import { detectDuplicateImportWithCandidateLookup } from '@/lib/import/duplicate/import-duplicate-index-candidate.service';
import { executeSalesImport } from '@/lib/import/execution/sales-import-execution.service';
import { finalizeSalesImportInventory } from '@/lib/import/finalization/inventory-finalization.service';

const noDuplicate = {
  status: DUPLICATE_IMPORT_STATUS.NO_DUPLICATE,
  confidence: 0,
  matchedImport: null,
  matchedInvoices: [],
  matchedRows: 0,
  duplicateRowFingerprints: [],
  duplicateReasons: [],
  recommendation: DUPLICATE_IMPORT_RECOMMENDATION.CONTINUE,
};

const executionResult = {
  status: IMPORT_EXECUTION_STATUS.IMPORTED,
  importId: 'imp-1',
  imported: 1,
  skipped: 0,
  failed: 0,
  saleIds: ['sale-1'],
  rowResults: [],
  startedAt: '2026-03-01T10:00:00.000Z',
  completedAt: '2026-03-01T10:00:01.000Z',
  durationMs: 1000,
  warnings: [],
  errors: [],
};

const baseInput = {
  orgId: 'org-1',
  userId: 'user-1',
  bytes: new Uint8Array([1, 2, 3]),
  fileName: 'sales.csv',
  mapping: { columns: {} },
  resolutions: [],
};

describe('commitSalesImportPipeline deferred duplicate index', () => {
  beforeEach(() => {
    vi.mocked(prepareSalesImportResolvedReview).mockReset();
    vi.mocked(detectDuplicateImportWithCandidateLookup).mockReset();
    vi.mocked(executeSalesImport).mockReset();
    vi.mocked(finalizeSalesImportInventory).mockReset();
    vi.mocked(importIndexHealthService.scheduleDeferredImportDuplicateIndexWrite).mockReset();

    vi.mocked(prepareSalesImportResolvedReview).mockResolvedValue({
      resolvedReview: {
        overview: {
          fileName: 'sales.csv',
          detectedReportName: 'Sales Detail',
          detectedReportType: 'sales-detail',
          reportConfidence: 0.9,
          headerRowIndex: 0,
          totalRows: 1,
          readyRows: 1,
          warningRows: 0,
          errorRows: 0,
          averageConfidence: 90,
          autoImportEligibleRows: 0,
          blockedRows: 0,
        },
        reportSummary: {
          matchedColumns: [],
          missingRequiredColumns: [],
          extraColumns: [],
          unknownHeaders: [],
          detectionReasons: [],
        },
        rows: [],
      },
      reportType: 'sales-detail',
    });

    vi.mocked(detectDuplicateImportWithCandidateLookup).mockResolvedValue(noDuplicate);
    vi.mocked(executeSalesImport).mockResolvedValue(executionResult);
    vi.mocked(finalizeSalesImportInventory).mockResolvedValue({
      status: 'COMPLETED',
      importId: 'imp-1',
      saleIds: ['sale-1'],
      errors: [],
    });
  });

  it('schedules deferred index write after inventory finalization completes', async () => {
    const result = await commitSalesImportPipeline(baseInput);

    expect(result.status).toBe('success');
    expect(finalizeSalesImportInventory).toHaveBeenCalledOnce();
    expect(importIndexHealthService.scheduleDeferredImportDuplicateIndexWrite).toHaveBeenCalledWith({
      orgId: 'org-1',
      userId: 'user-1',
      importId: 'imp-1',
    });
  });

  it('schedules deferred index write when all rows were duplicate skips', async () => {
    vi.mocked(executeSalesImport).mockResolvedValue({
      ...executionResult,
      importId: 'imp-skip',
      imported: 0,
      skipped: 2,
      saleIds: [],
    });

    const result = await commitSalesImportPipeline({
      ...baseInput,
      duplicateReviewSkippedRowNumbers: [2, 3],
    });

    expect(result.status).toBe('success');
    expect(finalizeSalesImportInventory).not.toHaveBeenCalled();
    expect(importIndexHealthService.scheduleDeferredImportDuplicateIndexWrite).toHaveBeenCalledWith({
      orgId: 'org-1',
      userId: 'user-1',
      importId: 'imp-skip',
    });
  });

  it('does not schedule deferred index write when execution is blocked', async () => {
    vi.mocked(executeSalesImport).mockResolvedValue({
      ...executionResult,
      status: IMPORT_EXECUTION_STATUS.BLOCKED,
      importId: 'imp-blocked',
      imported: 0,
      errors: ['Duplicate import blocked'],
    });

    const result = await commitSalesImportPipeline(baseInput);

    expect(result.status).toBe('blocked');
    expect(finalizeSalesImportInventory).not.toHaveBeenCalled();
    expect(importIndexHealthService.scheduleDeferredImportDuplicateIndexWrite).not.toHaveBeenCalled();
  });

  it('does not schedule deferred index write during duplicate review', async () => {
    vi.mocked(detectDuplicateImportWithCandidateLookup).mockResolvedValue({
      ...noDuplicate,
      status: DUPLICATE_IMPORT_STATUS.POSSIBLE_DUPLICATE,
      recommendation: DUPLICATE_IMPORT_RECOMMENDATION.REVIEW,
      duplicateReasons: ['Some rows match a previous import'],
    });

    const result = await commitSalesImportPipeline(baseInput);

    expect(result.status).toBe('duplicate_review');
    expect(executeSalesImport).not.toHaveBeenCalled();
    expect(importIndexHealthService.scheduleDeferredImportDuplicateIndexWrite).not.toHaveBeenCalled();
  });
});