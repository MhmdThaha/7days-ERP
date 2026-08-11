/**
 * Sales Import Execution tests — draft sales + import history, no inventory.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DomainError } from '@/lib/domain/errors';
import {
  DUPLICATE_IMPORT_RECOMMENDATION,
  DUPLICATE_IMPORT_ROW_SKIP_REASON,
  DUPLICATE_IMPORT_STATUS,
  IMPORT_HISTORY_STATUS,
  buildDuplicateImportRowFingerprint,
  type DuplicateImportResult,
} from '@/lib/import/duplicate';
import {
  executeSalesImport,
  IMPORT_EXECUTION_STATUS,
  isSalesImportRowImportable,
} from '@/lib/import/execution';
import type { ImportReviewViewModelWithResolution, ResolvedImportReviewRow } from '@/lib/import/resolution/types';
import { SALES_DETAIL_REPORT } from '@/lib/import/reports/definitions';
import {
  AUTO_IMPORT_RECOMMENDATION,
  CONFIDENCE_LEVEL,
} from '@/lib/import/services/confidence-engine.service';
import {
  CONFLICT_ENGINE_STATUS,
  IMPORT_CONFLICT_CODE,
} from '@/lib/import/services/conflict-engine.service';
import { PRODUCT_MATCH_STATUS } from '@/lib/import/services/product-matching.service';
import { importHistoryRepository } from '@/lib/repositories/import-history.repository';
import { productRepository } from '@/lib/repositories/product.repository';
import { saleService } from '@/lib/services/sale.service';

vi.mock('@/lib/services/sale.service', () => ({
  saleService: {
    create: vi.fn(),
    complete: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/product.repository', () => ({
  productRepository: {
    getById: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/import-history.repository', () => ({
  importHistoryRepository: {
    create: vi.fn(),
  },
}));

const noDuplicate: DuplicateImportResult = {
  status: DUPLICATE_IMPORT_STATUS.NO_DUPLICATE,
  confidence: 0,
  matchedImport: null,
  matchedInvoices: [],
  matchedRows: 0,
  duplicateRowFingerprints: [],
  duplicateReasons: [],
  recommendation: DUPLICATE_IMPORT_RECOMMENDATION.CONTINUE,
};

const blockedDuplicate: DuplicateImportResult = {
  status: DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE,
  confidence: 100,
  matchedImport: {
    importId: 'imp-old',
    importedAt: '2026-03-01T10:00:00.000Z',
    importedBy: 'owner@test',
    status: 'COMPLETED',
  },
  matchedInvoices: [],
  matchedRows: 1,
  duplicateRowFingerprints: ['fp-1'],
  duplicateReasons: ['Identical file fingerprint'],
  recommendation: DUPLICATE_IMPORT_RECOMMENDATION.BLOCK_IMPORT,
};

function importableRow(
  rowNumber: number,
  overrides: Partial<ResolvedImportReviewRow> = {},
): ResolvedImportReviewRow {
  return {
    rowNumber,
    originalValues: {},
    normalizedValues: {
      saleDate: '2026-03-15',
      customerName: 'Corner Store',
      productName: 'Milk Bread',
      productCode: 'BRD-001',
      quantity: 2,
      saleNumber: `SAL-${rowNumber}`,
    },
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
      matchedProductName: 'Milk Bread',
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

function review(rows: ResolvedImportReviewRow[]): ImportReviewViewModelWithResolution {
  return {
    overview: {
      fileName: 'sales.csv',
      detectedReportName: 'Sales Detail',
      detectedReportType: 'sales-detail',
      reportConfidence: 0.9,
      headerRowIndex: 0,
      totalRows: rows.length,
      readyRows: rows.length,
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
    rows,
  };
}

beforeEach(() => {
  vi.mocked(saleService.create).mockReset();
  vi.mocked(saleService.complete).mockReset();
  vi.mocked(productRepository.getById).mockReset();
  vi.mocked(importHistoryRepository.create).mockReset();

  vi.mocked(productRepository.getById).mockResolvedValue({
    id: 'prod-bread',
    organizationId: 'org-1',
    code: 'BRD-001',
    name: 'Milk Bread',
    category: 'Breads',
    unit: 'pcs',
    sellingPrice: 4500,
    description: null,
    isActive: true,
    currentStock: 10,
    averageCost: 3000,
    activeRecipeId: null,
    imageUrl: null,
    createdAt: new Date(),
    createdBy: 'user',
    updatedAt: new Date(),
    updatedBy: 'user',
    deletedAt: null,
    deletedBy: null,
  });

  vi.mocked(saleService.create).mockResolvedValue({
    id: 'sale-1',
    organizationId: 'org-1',
    saleNumber: 'SAL-100',
    saleDate: '2026-03-15',
    customerId: null,
    customerNameSnapshot: 'Corner Store',
    status: 'draft',
    lines: [],
    subtotal: 9000,
    totalCogs: 0,
    lineCount: 1,
    notes: null,
    createdAt: new Date(),
    createdBy: 'user-1',
    updatedAt: new Date(),
    updatedBy: 'user-1',
    completedAt: null,
    completedBy: null,
    deletedAt: null,
    deletedBy: null,
  });

  vi.mocked(importHistoryRepository.create).mockResolvedValue({
    importId: 'imp-1',
    importedAt: '2026-03-15T12:00:00.000Z',
    importedBy: 'user-1',
    reportType: 'sales-detail',
    rowCount: 1,
    fileFingerprint: 'fp-1',
    invoiceNumbers: ['SAL-2'],
    rowFingerprints: ['row-fp'],
    status: 'IMPORTED',
  });
});

describe('isSalesImportRowImportable', () => {
  it('allows READY and WARNING rows with resolved products', () => {
    expect(isSalesImportRowImportable(importableRow(2))).toBe(true);
    expect(
      isSalesImportRowImportable(
        importableRow(3, {
          conflictEngineResult: {
            status: CONFLICT_ENGINE_STATUS.WARNING,
            conflicts: [],
            warnings: [
              {
                code: IMPORT_CONFLICT_CODE.INACTIVE_PRODUCT,
                message: 'Inactive product',
                field: 'productName',
              },
            ],
            blockingReason: null,
            recommendedAction: null,
            confidencePenalty: 12,
          },
        }),
      ),
    ).toBe(true);
  });

  it('rejects ERROR, skipped, and unresolved rows', () => {
    expect(
      isSalesImportRowImportable(
        importableRow(2, {
          conflictEngineResult: {
            status: CONFLICT_ENGINE_STATUS.ERROR,
            conflicts: [
              {
                code: IMPORT_CONFLICT_CODE.UNKNOWN_PRODUCT,
                message: 'Unknown',
                field: 'productName',
              },
            ],
            warnings: [],
            blockingReason: 'Unknown',
            recommendedAction: null,
            confidencePenalty: 40,
          },
        }),
      ),
    ).toBe(false);

    expect(
      isSalesImportRowImportable(
        importableRow(2, {
          productResolution: { action: 'skip-row', resolvedInMemory: true },
        }),
      ),
    ).toBe(false);
  });
});

describe('executeSalesImport', () => {
  it('aborts with no writes when duplicate protection blocks the import', async () => {
    const result = await executeSalesImport({
      resolvedReview: review([importableRow(2)]),
      duplicateResult: blockedDuplicate,
      reportType: 'sales-detail',
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(result.status).toBe(IMPORT_EXECUTION_STATUS.BLOCKED);
    expect(result.importId).toBeNull();
    expect(vi.mocked(saleService.create)).not.toHaveBeenCalled();
    expect(vi.mocked(importHistoryRepository.create)).not.toHaveBeenCalled();
  });

  it('creates draft sales and import history on a normal import', async () => {
    const result = await executeSalesImport({
      resolvedReview: review([importableRow(2)]),
      duplicateResult: noDuplicate,
      reportType: 'sales-detail',
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(result.status).toBe(IMPORT_EXECUTION_STATUS.IMPORTED);
    expect(result.imported).toBe(1);
    expect(result.importId).toBe('imp-1');
    expect(result.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.warnings).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(vi.mocked(saleService.create)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saleService.complete)).not.toHaveBeenCalled();
    expect(vi.mocked(importHistoryRepository.create)).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      expect.objectContaining({
        rowsImported: 1,
        reportType: 'sales-detail',
        saleIds: ['sale-1'],
        lifecycleStatus: IMPORT_HISTORY_STATUS.IMPORTED,
        executionStatus: IMPORT_EXECUTION_STATUS.IMPORTED,
      }),
    );
  });

  it('supports partial imports when one sale group fails', async () => {
    vi.mocked(saleService.create)
      .mockResolvedValueOnce({
        id: 'sale-ok',
        organizationId: 'org-1',
        saleNumber: 'SAL-OK',
        saleDate: '2026-03-15',
        customerId: null,
        customerNameSnapshot: 'A',
        status: 'draft',
        lines: [],
        subtotal: 1000,
        totalCogs: 0,
        lineCount: 1,
        notes: null,
        createdAt: new Date(),
        createdBy: 'user-1',
        updatedAt: new Date(),
        updatedBy: 'user-1',
        completedAt: null,
        completedBy: null,
        deletedAt: null,
        deletedBy: null,
      })
      .mockRejectedValueOnce(new DomainError('VALIDATION_ERROR', 'Sale number already exists'));

    const result = await executeSalesImport({
      resolvedReview: review([
        importableRow(2, { normalizedValues: { ...importableRow(2).normalizedValues, saleNumber: 'SAL-OK' } }),
        importableRow(3, { normalizedValues: { ...importableRow(3).normalizedValues, saleNumber: 'SAL-FAIL' } }),
      ]),
      duplicateResult: noDuplicate,
      reportType: 'sales-detail',
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(result.status).toBe(IMPORT_EXECUTION_STATUS.PARTIAL);
    expect(result.imported).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.importId).toBe('imp-1');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(vi.mocked(importHistoryRepository.create)).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      expect.objectContaining({
        lifecycleStatus: IMPORT_HISTORY_STATUS.IMPORTED,
        executionStatus: IMPORT_EXECUTION_STATUS.PARTIAL,
      }),
    );
  });

  it('skips rows marked skip-row and rows with blocking errors', async () => {
    const result = await executeSalesImport({
      resolvedReview: review([
        importableRow(2),
        importableRow(3, {
          productResolution: { action: 'skip-row', resolvedInMemory: true },
        }),
        importableRow(4, {
          conflictEngineResult: {
            status: CONFLICT_ENGINE_STATUS.ERROR,
            conflicts: [
              {
                code: IMPORT_CONFLICT_CODE.UNKNOWN_PRODUCT,
                message: 'Unknown',
                field: 'productName',
              },
            ],
            warnings: [],
            blockingReason: 'Unknown',
            recommendedAction: null,
            confidencePenalty: 40,
          },
        }),
      ]),
      duplicateResult: noDuplicate,
      reportType: 'sales-detail',
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(2);
    expect(result.rowResults.filter((entry) => entry.status === 'skipped')).toHaveLength(2);
  });

  it('records failed rows when sale creation throws', async () => {
    vi.mocked(saleService.create).mockRejectedValue(
      new DomainError('VALIDATION_ERROR', 'Sale number already exists'),
    );

    const result = await executeSalesImport({
      resolvedReview: review([importableRow(2)]),
      duplicateResult: noDuplicate,
      reportType: 'sales-detail',
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(result.status).toBe(IMPORT_EXECUTION_STATUS.FAILED);
    expect(result.failed).toBe(1);
    expect(result.importId).toBeNull();
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('Row 2')]),
    );
    expect(result.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(vi.mocked(importHistoryRepository.create)).not.toHaveBeenCalled();
  });

  it('writes import history fingerprints from the resolved review rows', async () => {
    await executeSalesImport({
      resolvedReview: review([importableRow(2)]),
      duplicateResult: noDuplicate,
      reportType: 'sales-detail',
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(vi.mocked(importHistoryRepository.create)).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      expect.objectContaining({
        fileFingerprint: expect.any(String),
        invoiceNumbers: expect.arrayContaining(['SAL-2']),
        rowFingerprints: expect.any(Array),
      }),
    );
  });

  it('skips duplicate fingerprints and imports only new rows on SKIP_DUPLICATES', async () => {
    const duplicateRow = importableRow(2, {
      normalizedValues: {
        saleDate: '2026-03-01',
        customerName: 'Old Store',
        productName: 'Milk Bread',
        productCode: 'BRD-001',
        quantity: 2,
        saleNumber: 'SAL-OLD',
      },
    });
    const newRow = importableRow(3, {
      normalizedValues: {
        saleDate: '2026-03-02',
        customerName: 'New Store',
        productName: 'Milk Bread',
        productCode: 'BRD-001',
        quantity: 1,
        saleNumber: 'SAL-NEW',
      },
    });
    const duplicateFp = buildDuplicateImportRowFingerprint(duplicateRow);

    vi.mocked(saleService.create).mockResolvedValueOnce({
      id: 'sale-new-only',
      organizationId: 'org-1',
      saleNumber: 'SAL-NEW',
      saleDate: '2026-03-02',
      customerId: null,
      customerNameSnapshot: 'New Store',
      status: 'draft',
      lines: [],
      subtotal: 4500,
      totalCogs: 0,
      lineCount: 1,
      notes: null,
      createdAt: new Date(),
      createdBy: 'user-1',
      updatedAt: new Date(),
      updatedBy: 'user-1',
      completedAt: null,
      completedBy: null,
      deletedAt: null,
      deletedBy: null,
    });

    const result = await executeSalesImport({
      resolvedReview: review([duplicateRow, newRow]),
      duplicateResult: {
        status: DUPLICATE_IMPORT_STATUS.HIGH_CONFIDENCE_DUPLICATE,
        confidence: 90,
        matchedImport: {
          importId: 'imp-prior',
          importedAt: '2026-03-01T10:00:00.000Z',
          importedBy: 'owner@test',
          status: 'COMPLETED',
        },
        matchedInvoices: [],
        matchedRows: 1,
        duplicateRowFingerprints: [duplicateFp],
        duplicateReasons: ['90% of rows match a completed import.'],
        recommendation: DUPLICATE_IMPORT_RECOMMENDATION.SKIP_DUPLICATES,
      },
      reportType: 'sales-detail',
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.saleIds).toEqual(['sale-new-only']);
    expect(result.rowResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rowNumber: 2,
          status: 'skipped',
          reason: DUPLICATE_IMPORT_ROW_SKIP_REASON,
        }),
        expect.objectContaining({
          rowNumber: 3,
          status: 'imported',
          saleId: 'sale-new-only',
        }),
      ]),
    );
    expect(vi.mocked(saleService.create)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saleService.complete)).not.toHaveBeenCalled();
    expect(vi.mocked(importHistoryRepository.create)).toHaveBeenCalledTimes(1);
  });

  it('imports zero rows when every row is a SKIP_DUPLICATES overlap', async () => {
    const rowA = importableRow(2);
    const rowB = importableRow(3, {
      normalizedValues: {
        ...importableRow(3).normalizedValues,
        saleNumber: 'SAL-3',
        customerName: 'Other',
      },
    });

    const result = await executeSalesImport({
      resolvedReview: review([rowA, rowB]),
      duplicateResult: {
        status: DUPLICATE_IMPORT_STATUS.HIGH_CONFIDENCE_DUPLICATE,
        confidence: 90,
        matchedImport: {
          importId: 'imp-prior',
          importedAt: '2026-03-01T10:00:00.000Z',
          importedBy: 'owner@test',
          status: 'COMPLETED',
        },
        matchedInvoices: [],
        matchedRows: 2,
        duplicateRowFingerprints: [
          buildDuplicateImportRowFingerprint(rowA),
          buildDuplicateImportRowFingerprint(rowB),
        ],
        duplicateReasons: ['100% of rows match a completed import.'],
        recommendation: DUPLICATE_IMPORT_RECOMMENDATION.SKIP_DUPLICATES,
      },
      reportType: 'sales-detail',
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(result.status).toBe(IMPORT_EXECUTION_STATUS.IMPORTED);
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(2);
    expect(result.saleIds).toEqual([]);
    expect(result.importId).toBeNull();
    expect(vi.mocked(saleService.create)).not.toHaveBeenCalled();
    expect(vi.mocked(saleService.complete)).not.toHaveBeenCalled();
    expect(vi.mocked(importHistoryRepository.create)).not.toHaveBeenCalled();
  });

  it('imports all rows when SKIP_DUPLICATES has an empty fingerprint list', async () => {
    const result = await executeSalesImport({
      resolvedReview: review([importableRow(2), importableRow(3)]),
      duplicateResult: {
        status: DUPLICATE_IMPORT_STATUS.HIGH_CONFIDENCE_DUPLICATE,
        confidence: 90,
        matchedImport: {
          importId: 'imp-prior',
          importedAt: '2026-03-01T10:00:00.000Z',
          importedBy: 'owner@test',
          status: 'COMPLETED',
        },
        matchedInvoices: [],
        matchedRows: 0,
        duplicateRowFingerprints: [],
        duplicateReasons: ['90% of rows match a completed import.'],
        recommendation: DUPLICATE_IMPORT_RECOMMENDATION.SKIP_DUPLICATES,
      },
      reportType: 'sales-detail',
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);
    expect(vi.mocked(saleService.create)).toHaveBeenCalledTimes(2);
  });
});
