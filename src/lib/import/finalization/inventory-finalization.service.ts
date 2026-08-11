/**
 * Inventory Finalization Service — Phase 10B orchestrates manual sale completion.
 *
 * For each draft sale created by Phase 10A, delegates to saleService.complete()
 * so imported sales follow the identical inventory, COGS, and daily-summary path.
 */

import 'server-only';

import { DomainError } from '@/lib/domain/errors';
import { IMPORT_HISTORY_STATUS } from '@/lib/import/duplicate';
import { IMPORT_EXECUTION_STATUS } from '@/lib/import/execution/sales-import-execution.types';
import {
  INVENTORY_FINALIZATION_STATUS,
  type FinalizeSalesImportInventoryInput,
  type InventoryFinalizationResult,
  type SaleInventoryFinalizationOutcome,
} from '@/lib/import/finalization/inventory-finalization.types';
import { importHistoryRepository } from '@/lib/repositories/import-history.repository';
import { saleRepository } from '@/lib/repositories/sale.repository';
import { saleService } from '@/lib/services/sale.service';

type FinalizationResultCore = Omit<
  InventoryFinalizationResult,
  'startedAt' | 'completedAt' | 'durationMs'
>;

export async function finalizeSalesImportInventory(
  input: FinalizeSalesImportInventoryInput,
): Promise<InventoryFinalizationResult> {
  const startedAt = new Date().toISOString();
  const { executionResult, orgId, userId } = input;

  if (!executionResult.importId) {
    return finalizeResult(
      emptyFailure('Import history id is required for inventory finalization.'),
      startedAt,
    );
  }

  if (executionResult.saleIds.length === 0) {
    return finalizeResult(
      skippedResult(['No sales were imported — inventory finalization skipped.']),
      startedAt,
    );
  }

  const importHistory = await importHistoryRepository.getById(orgId, executionResult.importId);

  if (!importHistory) {
    return finalizeResult(
      emptyFailure(`Import history ${executionResult.importId} was not found.`),
      startedAt,
    );
  }

  const historySaleIds = [...new Set(importHistory.saleIds)];

  if (importHistory.status === IMPORT_HISTORY_STATUS.COMPLETED) {
    const pendingSaleIds = await findPendingDraftSaleIds(orgId, historySaleIds);

    if (pendingSaleIds.length === 0) {
      return finalizeResult(
        skippedResult(['Import inventory has already been finalized.']),
        startedAt,
      );
    }
  } else if (
    importHistory.status !== IMPORT_HISTORY_STATUS.IMPORTED &&
    importHistory.status !== IMPORT_HISTORY_STATUS.FINALIZING
  ) {
    return finalizeResult(
      emptyFailure(
        `Import history must be IMPORTED before finalization (current: ${importHistory.status}).`,
      ),
      startedAt,
    );
  }

  await importHistoryRepository.updateLifecycle(orgId, executionResult.importId, userId, {
    status: IMPORT_HISTORY_STATUS.FINALIZING,
  });

  const saleIds =
    importHistory.status === IMPORT_HISTORY_STATUS.COMPLETED
      ? await findPendingDraftSaleIds(orgId, historySaleIds)
      : historySaleIds;

  if (saleIds.length === 0) {
    return finalizeResult(
      skippedResult(['No draft sales remain to finalize.']),
      startedAt,
    );
  }

  const outcomes: SaleInventoryFinalizationOutcome[] = [];
  const completedSaleIds: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const saleId of saleIds) {
    try {
      await completeDraftSale(orgId, saleId, userId);
      completedSaleIds.push(saleId);
      outcomes.push({ saleId, status: 'completed' });
    } catch (error) {
      const message = error instanceof DomainError ? error.message : 'Inventory finalization failed.';
      errors.push(`Sale ${saleId}: ${message}`);
      outcomes.push({ saleId, status: 'failed', reason: message });
    }
  }

  const completedSales = outcomes.filter((entry) => entry.status === 'completed').length;
  const failedSales = outcomes.filter((entry) => entry.status === 'failed').length;
  const finalizationStatus = resolveFinalizationStatus(completedSales, failedSales);

  if (completedSales > 0 && failedSales > 0) {
    warnings.push(
      `${failedSales} of ${saleIds.length} sales could not be finalized; remaining sales were processed.`,
    );
  }

  const lifecycleStatus =
    completedSales === 0
      ? IMPORT_HISTORY_STATUS.FAILED
      : IMPORT_HISTORY_STATUS.COMPLETED;
  const executionStatus =
    completedSales === 0
      ? IMPORT_EXECUTION_STATUS.FAILED
      : failedSales === 0
        ? IMPORT_EXECUTION_STATUS.IMPORTED
        : IMPORT_EXECUTION_STATUS.PARTIAL;

  await importHistoryRepository.updateLifecycle(orgId, executionResult.importId, userId, {
    status: lifecycleStatus,
    executionStatus,
  });

  return finalizeResult(
    {
      status: finalizationStatus,
      completedSales,
      failedSales,
      completedSaleIds,
      outcomes,
      warnings,
      errors,
    },
    startedAt,
  );
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function findPendingDraftSaleIds(
  orgId: string,
  saleIds: readonly string[],
): Promise<string[]> {
  const pending: string[] = [];

  for (const saleId of saleIds) {
    const existing = await saleRepository.getById(orgId, saleId);

    if (existing?.status === 'draft') {
      pending.push(saleId);
    }
  }

  return pending;
}

async function completeDraftSale(orgId: string, saleId: string, userId: string): Promise<void> {
  const existing = await saleRepository.getById(orgId, saleId);

  if (!existing) {
    throw new DomainError('NOT_FOUND', 'Sale not found');
  }

  if (existing.status === 'completed') {
    return;
  }

  await saleService.complete(orgId, saleId, userId);
}

function resolveFinalizationStatus(completedSales: number, failedSales: number) {
  if (completedSales === 0) {
    return INVENTORY_FINALIZATION_STATUS.FAILED;
  }

  if (failedSales > 0) {
    return INVENTORY_FINALIZATION_STATUS.PARTIAL;
  }

  return INVENTORY_FINALIZATION_STATUS.COMPLETED;
}

function finalizeResult(
  result: FinalizationResultCore,
  startedAt: string,
): InventoryFinalizationResult {
  const completedAt = new Date().toISOString();
  const durationMs = Math.max(
    0,
    new Date(completedAt).getTime() - new Date(startedAt).getTime(),
  );

  return {
    ...result,
    startedAt,
    completedAt,
    durationMs,
  };
}

function emptyFailure(message: string): FinalizationResultCore {
  return {
    status: INVENTORY_FINALIZATION_STATUS.FAILED,
    completedSales: 0,
    failedSales: 0,
    completedSaleIds: [],
    outcomes: [],
    warnings: [],
    errors: [message],
  };
}

function skippedResult(warnings: readonly string[]): FinalizationResultCore {
  return {
    status: INVENTORY_FINALIZATION_STATUS.SKIPPED,
    completedSales: 0,
    failedSales: 0,
    completedSaleIds: [],
    outcomes: [],
    warnings: [...warnings],
    errors: [],
  };
}
