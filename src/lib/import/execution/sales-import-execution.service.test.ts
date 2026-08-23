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
import { importIndexHealthService } from '@/lib/import/duplicate/import-index-repair.service';
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
    getByIds: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/import-history.repository', () => ({
  importHistoryRepository: {
    create: vi.fn(),
    beginOrResume: vi.fn(),
    listSourceSales: vi.fn(),
    updateLifecycle: vi.fn(),
  },
}));

vi.mock('@/lib/import/duplicate/import-index-repair.service', () => ({
  importIndexHealthService: {
    recordImportIndexWrite: vi.fn().mockResolvedValue(undefined),
    scheduleDeferredImportDuplicateIndexWrite: vi.fn(),
    persistImportDuplicateIndexForImport: vi.fn().mockResolvedValue(undefined),
  },
  importIndexRepairService: {
    scheduleRepair: vi.fn(),
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

function historyDetail(overrides: Record<string, unknown> = {}) {
  return {
    importId: 'imp-1',
    importedAt: '2026-03-15T12:00:00.000Z',
    importedBy: 'user-1',
    reportType: 'sales-detail',
    rowCount: 1,
    fileFingerprint: 'fp-1',
    invoiceNumbers: ['SAL-2'],
    rowFingerprints: ['row-fp'],
    status: IMPORT_HISTORY_STATUS.IMPORTING,
    rowsImported: 0,
    rowsSkipped: 0,
    rowsFailed: 0,
    saleIds: [] as string[],
    executionStatus: IMPORT_EXECUTION_STATUS.IMPORTED,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(saleService.create).mockReset();
  vi.mocked(saleService.complete).mockReset();
  vi.mocked(productRepository.getById).mockReset();
  vi.mocked(productRepository.getByIds).mockReset();
  vi.mocked(importHistoryRepository.create).mockReset();
  vi.mocked(importHistoryRepository.beginOrResume).mockReset();
  vi.mocked(importHistoryRepository.listSourceSales).mockReset();
  vi.mocked(importHistoryRepository.updateLifecycle).mockReset();

  vi.mocked(productRepository.getByIds).mockResolvedValue([
    {
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
    },
  ]);

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

  vi.mocked(importHistoryRepository.beginOrResume).mockResolvedValue({
    history: historyDetail(),
    resumed: false,
    alreadyCompleted: false,
  });
  vi.mocked(importHistoryRepository.listSourceSales).mockResolvedValue(new Map());
  vi.mocked(importHistoryRepository.updateLifecycle).mockResolvedValue(
    historyDetail({ status: IMPORT_HISTORY_STATUS.IMPORTED, rowsImported: 1, saleIds: ['sale-1'] }),
  );
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
    expect(vi.mocked(importHistoryRepository.beginOrResume)).not.toHaveBeenCalled();
    expect(vi.mocked(importHistoryRepository.create)).not.toHaveBeenCalled();
  });

  it('imports all rows when user acknowledged duplicate risk despite BLOCK recommendation', async () => {
    const result = await executeSalesImport({
      resolvedReview: review([importableRow(2)]),
      duplicateResult: blockedDuplicate,
      reportType: 'sales-detail',
      orgId: 'org-1',
      userId: 'user-1',
      acknowledgeDuplicateRisk: true,
    });

    expect(result.status).toBe(IMPORT_EXECUTION_STATUS.IMPORTED);
    expect(result.imported).toBe(1);
    expect(vi.mocked(saleService.create)).toHaveBeenCalled();
    expect(vi.mocked(importHistoryRepository.beginOrResume)).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      expect.objectContaining({
        forceNewSession: true,
        resumeImportId: undefined,
      }),
    );
  });

  it('passes resumeImportId for crash recovery without forcing a new session', async () => {
    vi.mocked(importHistoryRepository.beginOrResume).mockResolvedValue({
      history: historyDetail({ status: IMPORT_HISTORY_STATUS.IMPORTING }),
      resumed: true,
      alreadyCompleted: false,
    });

    await executeSalesImport({
      resolvedReview: review([importableRow(2)]),
      duplicateResult: {
        ...blockedDuplicate,
        matchedImport: {
          ...blockedDuplicate.matchedImport!,
          status: IMPORT_HISTORY_STATUS.IMPORTING,
        },
      },
      reportType: 'sales-detail',
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(vi.mocked(importHistoryRepository.beginOrResume)).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      expect.objectContaining({
        resumeImportId: 'imp-old',
        forceNewSession: false,
      }),
    );
  });

  it('does not force a new session when crash recovery resumes an in-progress import', async () => {
    vi.mocked(importHistoryRepository.beginOrResume).mockResolvedValue({
      history: historyDetail({ status: IMPORT_HISTORY_STATUS.IMPORTING }),
      resumed: true,
      alreadyCompleted: false,
    });

    await executeSalesImport({
      resolvedReview: review([importableRow(2)]),
      duplicateResult: {
        ...blockedDuplicate,
        matchedImport: {
          ...blockedDuplicate.matchedImport!,
          status: IMPORT_HISTORY_STATUS.IMPORTING,
        },
      },
      reportType: 'sales-detail',
      orgId: 'org-1',
      userId: 'user-1',
      acknowledgeDuplicateRisk: true,
    });

    expect(vi.mocked(importHistoryRepository.beginOrResume)).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      expect.objectContaining({
        resumeImportId: 'imp-old',
        forceNewSession: false,
      }),
    );
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
    expect(vi.mocked(saleService.create)).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        saleNumber: 'SAL-2',
      }),
      'user-1',
      expect.objectContaining({
        importSource: expect.objectContaining({
          importId: 'imp-1',
          groupKey: 'number:SAL-2',
        }),
      }),
    );
    expect(vi.mocked(saleService.complete)).not.toHaveBeenCalled();
    expect(vi.mocked(importHistoryRepository.beginOrResume)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(importHistoryRepository.create)).not.toHaveBeenCalled();
    expect(vi.mocked(importHistoryRepository.updateLifecycle)).toHaveBeenCalledWith(
      'org-1',
      'imp-1',
      'user-1',
      expect.objectContaining({
        rowsImported: 1,
        status: IMPORT_HISTORY_STATUS.IMPORTED,
        executionStatus: IMPORT_EXECUTION_STATUS.IMPORTED,
      }),
    );
    expect(productRepository.getByIds).toHaveBeenCalledTimes(1);
    expect(productRepository.getByIds).toHaveBeenCalledWith('org-1', ['prod-bread']);
    expect(productRepository.getById).not.toHaveBeenCalled();
  });

  it('batches missing selling-price reads for two products in one sale', async () => {
    vi.mocked(productRepository.getByIds).mockResolvedValue([
      {
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
      },
      {
        id: 'prod-cake',
        organizationId: 'org-1',
        code: 'CKE-010',
        name: 'Cake',
        category: 'Cakes',
        unit: 'pcs',
        sellingPrice: 12000,
        description: null,
        isActive: true,
        currentStock: 5,
        averageCost: 8000,
        activeRecipeId: null,
        imageUrl: null,
        createdAt: new Date(),
        createdBy: 'user',
        updatedAt: new Date(),
        updatedBy: 'user',
        deletedAt: null,
        deletedBy: null,
      },
    ]);

    await executeSalesImport({
      resolvedReview: review([
        importableRow(2, {
          normalizedValues: {
            saleDate: '2026-03-15',
            customerName: 'Corner Store',
            productName: 'Milk Bread',
            productCode: 'BRD-001',
            quantity: 1,
            saleNumber: 'SAL-SHARED',
          },
        }),
        importableRow(3, {
          normalizedValues: {
            saleDate: '2026-03-15',
            customerName: 'Corner Store',
            productName: 'Cake',
            productCode: 'CKE-010',
            quantity: 1,
            saleNumber: 'SAL-SHARED',
          },
          productMatchResult: {
            status: PRODUCT_MATCH_STATUS.MATCHED,
            matchedProductId: 'prod-cake',
            matchedProductName: 'Cake',
            confidence: 98,
            reason: 'Exact Name Match',
          },
        }),
      ]),
      duplicateResult: noDuplicate,
      reportType: 'sales-detail',
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(productRepository.getByIds).toHaveBeenCalledTimes(1);
    expect(productRepository.getByIds).toHaveBeenCalledWith('org-1', ['prod-bread', 'prod-cake']);
    expect(productRepository.getById).not.toHaveBeenCalled();
    expect(saleService.create).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        saleNumber: 'SAL-SHARED',
        lines: [
          { productId: 'prod-bread', quantity: 1, sellingPrice: 4500 },
          { productId: 'prod-cake', quantity: 1, sellingPrice: 12000 },
        ],
      }),
      'user-1',
      expect.objectContaining({
        importSource: expect.objectContaining({
          importId: 'imp-1',
          groupKey: 'number:SAL-SHARED',
        }),
      }),
    );
  });

  it('does not read products when every imported line already has a selling price', async () => {
    await executeSalesImport({
      resolvedReview: review([
        importableRow(2, {
          normalizedValues: {
            saleDate: '2026-03-15',
            customerName: 'Corner Store',
            productName: 'Milk Bread',
            productCode: 'BRD-001',
            quantity: 2,
            sellingPrice: 45,
            saleNumber: 'SAL-2',
          },
        }),
      ]),
      duplicateResult: noDuplicate,
      reportType: 'sales-detail',
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(productRepository.getByIds).not.toHaveBeenCalled();
    expect(productRepository.getById).not.toHaveBeenCalled();
    expect(saleService.create).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        lines: [{ productId: 'prod-bread', quantity: 2, sellingPrice: 4500 }],
      }),
      'user-1',
      expect.objectContaining({
        importSource: expect.objectContaining({ importId: 'imp-1' }),
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
    expect(vi.mocked(importHistoryRepository.updateLifecycle)).toHaveBeenCalledWith(
      'org-1',
      'imp-1',
      'user-1',
      expect.objectContaining({
        status: IMPORT_HISTORY_STATUS.IMPORTED,
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
    expect(result.importId).toBe('imp-1');
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('Row 2')]),
    );
    expect(result.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(vi.mocked(importHistoryRepository.beginOrResume)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(importHistoryRepository.updateLifecycle)).toHaveBeenCalledWith(
      'org-1',
      'imp-1',
      'user-1',
      expect.objectContaining({
        status: IMPORT_HISTORY_STATUS.FAILED,
        rowsFailed: 1,
      }),
    );
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

    expect(vi.mocked(importHistoryRepository.beginOrResume)).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      expect.objectContaining({
        fileFingerprint: expect.any(String),
        invoiceNumbers: expect.arrayContaining(['SAL-2']),
        rowFingerprints: expect.any(Array),
      }),
    );
  });

  it('does not write duplicate index during execution (deferred until after import completes)', async () => {
    await executeSalesImport({
      resolvedReview: review([importableRow(2)]),
      duplicateResult: noDuplicate,
      reportType: 'sales-detail',
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(vi.mocked(importIndexHealthService.recordImportIndexWrite)).not.toHaveBeenCalled();
    expect(
      vi.mocked(importIndexHealthService.scheduleDeferredImportDuplicateIndexWrite),
    ).not.toHaveBeenCalled();
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
    expect(vi.mocked(importHistoryRepository.beginOrResume)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(importHistoryRepository.create)).not.toHaveBeenCalled();
  });

  it('imports flagged rows when duplicate review leaves them selected', async () => {
    const duplicateRow = importableRow(2, {
      normalizedValues: {
        saleDate: '2026-03-01',
        customerName: 'Ravi',
        productName: 'Milk Bread',
        productCode: 'BRD-001',
        quantity: 10,
        saleNumber: 'SAL-OLD',
      },
    });
    const duplicateFp = buildDuplicateImportRowFingerprint(duplicateRow);

    const result = await executeSalesImport({
      resolvedReview: review([duplicateRow]),
      duplicateResult: {
        status: DUPLICATE_IMPORT_STATUS.HIGH_CONFIDENCE_DUPLICATE,
        confidence: 90,
        matchedImport: null,
        matchedInvoices: ['SAL-OLD'],
        matchedRows: 1,
        duplicateRowFingerprints: [duplicateFp],
        duplicateReasons: ['Similar sale already exists.'],
        recommendation: DUPLICATE_IMPORT_RECOMMENDATION.SKIP_DUPLICATES,
      },
      reportType: 'sales-detail',
      orgId: 'org-1',
      userId: 'user-1',
      duplicateReviewSkippedRowNumbers: [],
    });

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(vi.mocked(saleService.create)).toHaveBeenCalledTimes(1);
  });

  it('skips only rows unchecked in duplicate review', async () => {
    const duplicateRow = importableRow(2);
    const duplicateFp = buildDuplicateImportRowFingerprint(duplicateRow);

    const result = await executeSalesImport({
      resolvedReview: review([duplicateRow]),
      duplicateResult: {
        status: DUPLICATE_IMPORT_STATUS.POSSIBLE_DUPLICATE,
        confidence: 40,
        matchedImport: null,
        matchedInvoices: [],
        matchedRows: 1,
        duplicateRowFingerprints: [duplicateFp],
        duplicateReasons: ['2 rows overlap with a completed import.'],
        recommendation: DUPLICATE_IMPORT_RECOMMENDATION.REVIEW,
      },
      reportType: 'sales-detail',
      orgId: 'org-1',
      userId: 'user-1',
      duplicateReviewSkippedRowNumbers: [2],
    });

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(vi.mocked(saleService.create)).not.toHaveBeenCalled();
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
    expect(vi.mocked(importHistoryRepository.beginOrResume)).not.toHaveBeenCalled();
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

  it('opens import history before creating the first sale', async () => {
    const order: string[] = [];

    vi.mocked(importHistoryRepository.beginOrResume).mockImplementation(async () => {
      order.push('history');
      return { history: historyDetail(), resumed: false, alreadyCompleted: false };
    });
    vi.mocked(saleService.create).mockImplementation(async () => {
      order.push('sale');
      return {
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
      };
    });

    await executeSalesImport({
      resolvedReview: review([importableRow(2)]),
      duplicateResult: noDuplicate,
      reportType: 'sales-detail',
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(order).toEqual(['history', 'sale']);
  });

  it('resumes numbered invoices without creating a second sale', async () => {
    vi.mocked(importHistoryRepository.beginOrResume).mockResolvedValue({
      history: historyDetail({ status: IMPORT_HISTORY_STATUS.IMPORTING, resumed: undefined }),
      resumed: true,
      alreadyCompleted: false,
    });
    vi.mocked(importHistoryRepository.listSourceSales).mockResolvedValue(
      new Map([['number:SAL-2', 'sale-existing']]),
    );

    const result = await executeSalesImport({
      resolvedReview: review([importableRow(2)]),
      duplicateResult: {
        ...blockedDuplicate,
        matchedImport: {
          ...blockedDuplicate.matchedImport!,
          status: IMPORT_HISTORY_STATUS.IMPORTING,
        },
      },
      reportType: 'sales-detail',
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(result.imported).toBe(1);
    expect(result.saleIds).toEqual(['sale-existing']);
    expect(result.importId).toBe('imp-1');
    expect(vi.mocked(saleService.create)).not.toHaveBeenCalled();
  });

  it('resumes unnumbered invoices using the fallback group key', async () => {
    const unnumbered = importableRow(2, {
      normalizedValues: {
        saleDate: '2026-03-15',
        customerName: 'Corner Store',
        productName: 'Milk Bread',
        productCode: 'BRD-001',
        quantity: 10,
      },
    });

    vi.mocked(importHistoryRepository.listSourceSales).mockResolvedValue(
      new Map([['fallback:2026-03-15|corner store', 'sale-unnumbered']]),
    );

    const result = await executeSalesImport({
      resolvedReview: review([unnumbered]),
      duplicateResult: noDuplicate,
      reportType: 'sales-detail',
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(result.saleIds).toEqual(['sale-unnumbered']);
    expect(vi.mocked(saleService.create)).not.toHaveBeenCalled();
  });

  it('reuses the first 500 sales and creates only the remaining 500 on retry', async () => {
    const rows = [
      importableRow(2, {
        normalizedValues: { ...importableRow(2).normalizedValues, saleNumber: 'SAL-DONE' },
      }),
      importableRow(3, {
        normalizedValues: { ...importableRow(3).normalizedValues, saleNumber: 'SAL-REST' },
      }),
    ];

    vi.mocked(importHistoryRepository.listSourceSales).mockResolvedValue(
      new Map([['number:SAL-DONE', 'sale-done']]),
    );
    vi.mocked(saleService.create).mockResolvedValue({
      id: 'sale-rest',
      organizationId: 'org-1',
      saleNumber: 'SAL-REST',
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

    const result = await executeSalesImport({
      resolvedReview: review(rows),
      duplicateResult: noDuplicate,
      reportType: 'sales-detail',
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(result.saleIds).toEqual(['sale-done', 'sale-rest']);
    expect(vi.mocked(saleService.create)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saleService.create)).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ saleNumber: 'SAL-REST' }),
      'user-1',
      expect.objectContaining({
        importSource: expect.objectContaining({ groupKey: 'number:SAL-REST' }),
      }),
    );
  });

  it('blocks retry of an already completed import without creating sales', async () => {
    vi.mocked(importHistoryRepository.beginOrResume).mockResolvedValue({
      history: historyDetail({ status: IMPORT_HISTORY_STATUS.COMPLETED }),
      resumed: true,
      alreadyCompleted: true,
    });

    const result = await executeSalesImport({
      resolvedReview: review([importableRow(2)]),
      duplicateResult: noDuplicate,
      reportType: 'sales-detail',
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(result.status).toBe(IMPORT_EXECUTION_STATUS.BLOCKED);
    expect(result.importId).toBe('imp-1');
    expect(vi.mocked(saleService.create)).not.toHaveBeenCalled();
    expect(vi.mocked(importIndexHealthService.recordImportIndexWrite)).not.toHaveBeenCalled();
    expect(vi.mocked(importHistoryRepository.beginOrResume)).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      expect.objectContaining({
        forceNewSession: false,
        resumeImportId: undefined,
      }),
    );
  });

  it('keeps source-sale lookups scoped to the authenticated organization', async () => {
    await executeSalesImport({
      resolvedReview: review([importableRow(2)]),
      duplicateResult: noDuplicate,
      reportType: 'sales-detail',
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(importHistoryRepository.beginOrResume).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      expect.any(Object),
    );
    expect(importHistoryRepository.listSourceSales).toHaveBeenCalledWith('org-1', 'imp-1');
    expect(saleService.create).toHaveBeenCalledWith(
      'org-1',
      expect.any(Object),
      'user-1',
      expect.any(Object),
    );
  });

  it('groups two rows that share an invoice number into one sale', async () => {
    vi.mocked(productRepository.getByIds).mockResolvedValue([
      {
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
      },
      {
        id: 'prod-cake',
        organizationId: 'org-1',
        code: 'CKE-010',
        name: 'Cake',
        category: 'Cakes',
        unit: 'pcs',
        sellingPrice: 12000,
        description: null,
        isActive: true,
        currentStock: 5,
        averageCost: 8000,
        activeRecipeId: null,
        imageUrl: null,
        createdAt: new Date(),
        createdBy: 'user',
        updatedAt: new Date(),
        updatedBy: 'user',
        deletedAt: null,
        deletedBy: null,
      },
    ]);

    await executeSalesImport({
      resolvedReview: review([
        importableRow(2, {
          normalizedValues: { ...importableRow(2).normalizedValues, saleNumber: 'INV-DUP' },
        }),
        importableRow(3, {
          normalizedValues: {
            ...importableRow(3).normalizedValues,
            saleNumber: 'INV-DUP',
            productName: 'Cake',
            productCode: 'CKE-010',
          },
          productMatchResult: {
            status: PRODUCT_MATCH_STATUS.MATCHED,
            matchedProductId: 'prod-cake',
            matchedProductName: 'Cake',
            confidence: 98,
            reason: 'Exact Name Match',
          },
        }),
      ]),
      duplicateResult: noDuplicate,
      reportType: 'sales-detail',
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(saleService.create).toHaveBeenCalledTimes(1);
    expect(saleService.create).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ saleNumber: 'INV-DUP' }),
      'user-1',
      expect.objectContaining({
        importSource: expect.objectContaining({ groupKey: 'number:INV-DUP' }),
      }),
    );
  });

  it('keeps two same-looking numbered rows as two sales when invoices differ', async () => {
    const shared = {
      saleDate: '2026-03-15',
      customerName: 'Ravi',
      productName: 'Milk Bread',
      productCode: 'BRD-001',
      quantity: 10,
      sellingPrice: 45,
    };

    await executeSalesImport({
      resolvedReview: review([
        importableRow(2, { normalizedValues: { ...shared, saleNumber: 'INV-A' } }),
        importableRow(3, { normalizedValues: { ...shared, saleNumber: 'INV-B' } }),
      ]),
      duplicateResult: noDuplicate,
      reportType: 'sales-detail',
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(saleService.create).toHaveBeenCalledTimes(2);
    expect(saleService.create).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ saleNumber: 'INV-A' }),
      'user-1',
      expect.objectContaining({
        importSource: expect.objectContaining({ groupKey: 'number:INV-A' }),
      }),
    );
    expect(saleService.create).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ saleNumber: 'INV-B' }),
      'user-1',
      expect.objectContaining({
        importSource: expect.objectContaining({ groupKey: 'number:INV-B' }),
      }),
    );
  });

  it('on a 1000-row retry creates only the 500 groups that have no source-sale link', async () => {
    const rows = Array.from({ length: 1000 }, (_, index) => {
      const invoice = `INV-${String(index + 1).padStart(4, '0')}`;

      return importableRow(index + 2, {
        normalizedValues: {
          saleDate: '2026-03-15',
          customerName: 'Ravi',
          productName: 'Milk Bread',
          productCode: 'BRD-001',
          quantity: 10,
          sellingPrice: 45,
          saleNumber: invoice,
        },
      });
    });

    const existing = new Map(
      rows.slice(0, 500).map((row) => {
        const invoice = String(row.normalizedValues['saleNumber']).toUpperCase();
        return [`number:${invoice}`, `sale-existing-${invoice}`] as const;
      }),
    );

    vi.mocked(importHistoryRepository.listSourceSales).mockResolvedValue(existing);

    let created = 0;
    vi.mocked(saleService.create).mockImplementation(async (_orgId, input) => {
      created += 1;

      return {
        id: `sale-new-${created}`,
        organizationId: 'org-1',
        saleNumber: input.saleNumber ?? `NEW-${created}`,
        saleDate: '2026-03-15',
        customerId: null,
        customerNameSnapshot: 'Ravi',
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
      };
    });

    const result = await executeSalesImport({
      resolvedReview: review(rows),
      duplicateResult: noDuplicate,
      reportType: 'sales-detail',
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(result.saleIds).toHaveLength(1000);
    expect(result.saleIds.slice(0, 500)).toEqual(
      rows.slice(0, 500).map((row) => `sale-existing-${String(row.normalizedValues['saleNumber']).toUpperCase()}`),
    );
    expect(created).toBe(500);
    expect(saleService.create).toHaveBeenCalledTimes(500);
    expect(saleService.complete).not.toHaveBeenCalled();
  });
});
