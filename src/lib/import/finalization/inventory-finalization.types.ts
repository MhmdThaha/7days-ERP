/**
 * Inventory Finalization types — Phase 10B orchestrates manual sale completion per draft.
 */

import type { ImportExecutionResult } from '@/lib/import/execution/sales-import-execution.types';

export const INVENTORY_FINALIZATION_STATUS = {
  COMPLETED: 'COMPLETED',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
} as const;

export type InventoryFinalizationStatus =
  (typeof INVENTORY_FINALIZATION_STATUS)[keyof typeof INVENTORY_FINALIZATION_STATUS];

export type SaleInventoryFinalizationOutcome = {
  saleId: string;
  status: 'completed' | 'failed';
  reason?: string;
};

export type InventoryFinalizationResult = {
  status: InventoryFinalizationStatus;
  completedSales: number;
  failedSales: number;
  completedSaleIds: readonly string[];
  outcomes: readonly SaleInventoryFinalizationOutcome[];
  warnings: readonly string[];
  errors: readonly string[];
  startedAt: string;
  completedAt: string;
  durationMs: number;
};

export type FinalizeSalesImportInventoryInput = {
  executionResult: ImportExecutionResult;
  orgId: string;
  userId: string;
};
