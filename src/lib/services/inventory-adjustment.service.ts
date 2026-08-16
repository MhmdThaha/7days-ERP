import 'server-only';

import { inventoryAdjustmentRepository } from '@/lib/repositories/inventory-adjustment.repository';
import type {
  ConfirmInventoryAdjustmentInput,
  CreateInventoryAdjustmentDraftInput,
  InventoryAdjustment,
} from '@/types/inventory-adjustment';

export const inventoryAdjustmentService = {
  async createDraft(
    orgId: string,
    input: CreateInventoryAdjustmentDraftInput,
    userId: string,
  ): Promise<{ id: string; status: 'draft' }> {
    return inventoryAdjustmentRepository.createDraft(orgId, input, userId);
  },

  async complete(orgId: string, adjustmentId: string, userId: string): Promise<InventoryAdjustment> {
    return inventoryAdjustmentRepository.complete(orgId, adjustmentId, userId);
  },

  async confirm(
    orgId: string,
    input: ConfirmInventoryAdjustmentInput,
    userId: string,
  ): Promise<InventoryAdjustment> {
    return inventoryAdjustmentRepository.confirm(orgId, input, userId);
  },
};
