/**
 * Inventory Finalization tests — Phase 10B delegates to saleService.complete().
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DomainError } from '@/lib/domain/errors';
import { IMPORT_HISTORY_STATUS } from '@/lib/import/duplicate';
import { IMPORT_EXECUTION_STATUS } from '@/lib/import/execution/sales-import-execution.types';
import type { ImportExecutionResult } from '@/lib/import/execution/sales-import-execution.types';
import {
  finalizeSalesImportInventory,
  INVENTORY_FINALIZATION_STATUS,
} from '@/lib/import/finalization';
import { importHistoryRepository } from '@/lib/repositories/import-history.repository';
import { saleRepository } from '@/lib/repositories/sale.repository';
import { saleService } from '@/lib/services/sale.service';

vi.mock('@/lib/repositories/import-history.repository', () => ({
  importHistoryRepository: {
    getById: vi.fn(),
    updateLifecycle: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/sale.repository', () => ({
  saleRepository: {
    getById: vi.fn(),
  },
}));

vi.mock('@/lib/services/sale.service', () => ({
  saleService: {
    complete: vi.fn(),
  },
}));

const baseExecutionResult: ImportExecutionResult = {
  importId: 'imp-1',
  imported: 2,
  skipped: 0,
  failed: 0,
  status: IMPORT_EXECUTION_STATUS.IMPORTED,
  saleIds: ['sale-1', 'sale-2'],
  rowResults: [],
  startedAt: '2026-03-15T10:00:00.000Z',
  completedAt: '2026-03-15T10:00:01.000Z',
  durationMs: 1000,
  warnings: [],
  errors: [],
};

const importedHistory = {
  importId: 'imp-1',
  importedAt: '2026-03-15T10:00:00.000Z',
  importedBy: 'user-1',
  reportType: 'sales-detail',
  rowCount: 2,
  fileFingerprint: 'fp-1',
  invoiceNumbers: ['SAL-1'],
  rowFingerprints: ['row-1'],
  status: IMPORT_HISTORY_STATUS.IMPORTED,
  rowsImported: 2,
  rowsSkipped: 0,
  rowsFailed: 0,
  saleIds: ['sale-1', 'sale-2'],
  executionStatus: IMPORT_EXECUTION_STATUS.IMPORTED,
};

function draftSale(saleId: string) {
  return {
    id: saleId,
    organizationId: 'org-1',
    saleNumber: saleId === 'sale-1' ? 'SAL-100' : 'SAL-101',
    saleDate: '2026-03-15',
    customerId: null,
    customerNameSnapshot: 'Store',
    status: 'draft' as const,
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
}

function completedSale(saleId: string) {
  return {
    ...draftSale(saleId),
    status: 'completed' as const,
    totalCogs: 1500,
    completedAt: new Date(),
    completedBy: 'user-1',
  };
}

beforeEach(() => {
  vi.mocked(saleService.complete).mockReset();
  vi.mocked(importHistoryRepository.getById).mockReset();
  vi.mocked(importHistoryRepository.updateLifecycle).mockReset();
  vi.mocked(saleRepository.getById).mockReset();

  vi.mocked(importHistoryRepository.getById).mockResolvedValue(importedHistory);
  vi.mocked(importHistoryRepository.updateLifecycle).mockImplementation(async (_orgId, importId) => ({
    ...importedHistory,
    importId,
    status: IMPORT_HISTORY_STATUS.COMPLETED,
  }));

  vi.mocked(saleRepository.getById).mockImplementation(async (_orgId, saleId) => draftSale(saleId));

  vi.mocked(saleService.complete).mockImplementation(async (_orgId, saleId) => completedSale(saleId));
});

describe('finalizeSalesImportInventory', () => {
  it('completes all draft sales via saleService.complete and advances history to COMPLETED', async () => {
    const result = await finalizeSalesImportInventory({
      executionResult: baseExecutionResult,
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(result.status).toBe(INVENTORY_FINALIZATION_STATUS.COMPLETED);
    expect(result.completedSales).toBe(2);
    expect(result.failedSales).toBe(0);
    expect(result.completedSaleIds).toEqual(['sale-1', 'sale-2']);
    expect(result.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    expect(saleService.complete).toHaveBeenCalledTimes(2);
    expect(saleService.complete).toHaveBeenCalledWith('org-1', 'sale-1', 'user-1');
    expect(saleService.complete).toHaveBeenCalledWith('org-1', 'sale-2', 'user-1');

    expect(importHistoryRepository.updateLifecycle).toHaveBeenNthCalledWith(
      1,
      'org-1',
      'imp-1',
      'user-1',
      { status: IMPORT_HISTORY_STATUS.FINALIZING },
    );
    expect(importHistoryRepository.updateLifecycle).toHaveBeenNthCalledWith(
      2,
      'org-1',
      'imp-1',
      'user-1',
      {
        status: IMPORT_HISTORY_STATUS.COMPLETED,
        executionStatus: IMPORT_EXECUTION_STATUS.IMPORTED,
      },
    );
  });

  it('finalizes only Phase 10A sale ids (newly imported drafts after SKIP_DUPLICATES)', async () => {
    vi.mocked(importHistoryRepository.getById).mockResolvedValue({
      ...importedHistory,
      saleIds: ['sale-new-only'],
      rowsImported: 1,
      rowsSkipped: 9,
    });

    const result = await finalizeSalesImportInventory({
      executionResult: {
        ...baseExecutionResult,
        saleIds: ['sale-new-only'],
        imported: 1,
        skipped: 9,
      },
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(result.status).toBe(INVENTORY_FINALIZATION_STATUS.COMPLETED);
    expect(result.completedSaleIds).toEqual(['sale-new-only']);
    expect(saleService.complete).toHaveBeenCalledTimes(1);
    expect(saleService.complete).toHaveBeenCalledWith('org-1', 'sale-new-only', 'user-1');
  });

  it('continues remaining sales when one completion fails and marks history PARTIAL', async () => {
    vi.mocked(saleService.complete)
      .mockResolvedValueOnce(completedSale('sale-1'))
      .mockRejectedValueOnce(
        new DomainError(
          'VALIDATION_ERROR',
          'Insufficient stock for "Bread". Available: 0, required: 2',
        ),
      );

    const result = await finalizeSalesImportInventory({
      executionResult: baseExecutionResult,
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(result.status).toBe(INVENTORY_FINALIZATION_STATUS.PARTIAL);
    expect(result.completedSales).toBe(1);
    expect(result.failedSales).toBe(1);
    expect(result.completedSaleIds).toEqual(['sale-1']);
    expect(result.errors).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(importHistoryRepository.updateLifecycle).toHaveBeenLastCalledWith(
      'org-1',
      'imp-1',
      'user-1',
      {
        status: IMPORT_HISTORY_STATUS.COMPLETED,
        executionStatus: IMPORT_EXECUTION_STATUS.PARTIAL,
      },
    );
  });

  it('marks import history FAILED when every sale fails finalization', async () => {
    vi.mocked(saleService.complete).mockRejectedValue(
      new DomainError('VALIDATION_ERROR', 'Insufficient stock for "Bread". Available: 0, required: 2'),
    );

    const result = await finalizeSalesImportInventory({
      executionResult: baseExecutionResult,
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(result.status).toBe(INVENTORY_FINALIZATION_STATUS.FAILED);
    expect(result.completedSales).toBe(0);
    expect(result.failedSales).toBe(2);
    expect(importHistoryRepository.updateLifecycle).toHaveBeenLastCalledWith(
      'org-1',
      'imp-1',
      'user-1',
      {
        status: IMPORT_HISTORY_STATUS.FAILED,
        executionStatus: IMPORT_EXECUTION_STATUS.FAILED,
      },
    );
  });

  it('skips saleService.complete when a sale is already completed (retry support)', async () => {
    vi.mocked(saleRepository.getById).mockImplementation(async (_orgId, saleId) => {
      if (saleId === 'sale-1') {
        return completedSale('sale-1');
      }

      return draftSale('sale-2');
    });

    const result = await finalizeSalesImportInventory({
      executionResult: baseExecutionResult,
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(result.completedSales).toBe(2);
    expect(saleService.complete).toHaveBeenCalledTimes(1);
    expect(saleService.complete).toHaveBeenCalledWith('org-1', 'sale-2', 'user-1');
  });

  it('retries remaining draft sales when import history is already COMPLETED', async () => {
    vi.mocked(importHistoryRepository.getById).mockResolvedValue({
      ...importedHistory,
      status: IMPORT_HISTORY_STATUS.COMPLETED,
      saleIds: ['sale-1', 'sale-2'],
    });
    vi.mocked(saleRepository.getById).mockImplementation(async (_orgId, saleId) => {
      if (saleId === 'sale-1') {
        return completedSale('sale-1');
      }

      return draftSale('sale-2');
    });

    const result = await finalizeSalesImportInventory({
      executionResult: baseExecutionResult,
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(result.completedSales).toBe(1);
    expect(saleService.complete).toHaveBeenCalledTimes(1);
    expect(saleService.complete).toHaveBeenCalledWith('org-1', 'sale-2', 'user-1');
  });

  it('skips when import history is already COMPLETED and all sales are finalized', async () => {
    vi.mocked(importHistoryRepository.getById).mockResolvedValue({
      ...importedHistory,
      status: IMPORT_HISTORY_STATUS.COMPLETED,
      saleIds: ['sale-1', 'sale-2'],
    });
    vi.mocked(saleRepository.getById).mockImplementation(async (_orgId, saleId) =>
      completedSale(saleId),
    );

    const result = await finalizeSalesImportInventory({
      executionResult: baseExecutionResult,
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(result.status).toBe(INVENTORY_FINALIZATION_STATUS.SKIPPED);
    expect(saleService.complete).not.toHaveBeenCalled();
    expect(importHistoryRepository.updateLifecycle).not.toHaveBeenCalled();
  });

  it('rejects finalization when import history is not IMPORTED', async () => {
    vi.mocked(importHistoryRepository.getById).mockResolvedValue({
      ...importedHistory,
      status: IMPORT_HISTORY_STATUS.IMPORTING,
    });

    const result = await finalizeSalesImportInventory({
      executionResult: baseExecutionResult,
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(result.status).toBe(INVENTORY_FINALIZATION_STATUS.FAILED);
    expect(result.errors[0]).toContain('IMPORTED');
    expect(saleService.complete).not.toHaveBeenCalled();
  });

  it('records execution metadata on failure paths', async () => {
    const result = await finalizeSalesImportInventory({
      executionResult: { ...baseExecutionResult, importId: null },
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(result.status).toBe(INVENTORY_FINALIZATION_STATUS.FAILED);
    expect(result.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
