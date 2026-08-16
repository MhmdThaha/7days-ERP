'use server';

import { confirmInventoryAdjustmentSchema } from '@/lib/domain/schemas/inventory-adjustment.schema';
import { DomainError } from '@/lib/domain/errors';
import { assertCan } from '@/lib/domain/permissions';
import { getAuthenticatedContext } from '@/lib/firebase/auth-server';
import { inventoryAdjustmentService } from '@/lib/services/inventory-adjustment.service';
import { wrapAction, type ActionResult } from '@/lib/utils/action-result';
import type {
  ConfirmInventoryAdjustmentInput,
  InventoryAdjustment,
} from '@/types/inventory-adjustment';

function parseConfirmInput(input: ConfirmInventoryAdjustmentInput): ConfirmInventoryAdjustmentInput {
  const parsed = confirmInventoryAdjustmentSchema.safeParse(input);

  if (!parsed.success) {
    throw new DomainError(
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Enter a valid inventory adjustment.',
    );
  }

  return {
    itemType: parsed.data.itemType,
    itemId: parsed.data.itemId,
    physicalCount: parsed.data.physicalCount,
    reason: parsed.data.reason,
    notes: parsed.data.notes ?? null,
  };
}

export async function confirmInventoryAdjustmentAction(
  input: ConfirmInventoryAdjustmentInput,
): Promise<ActionResult<InventoryAdjustment>> {
  return wrapAction(async () => {
    const { orgId, userId, role } = await getAuthenticatedContext();
    assertCan(role, 'create', 'inventory');
    assertCan(role, 'complete', 'inventory');
    const validated = parseConfirmInput(input);
    return inventoryAdjustmentService.confirm(orgId, validated, userId);
  });
}

export async function completeInventoryAdjustmentAction(
  adjustmentId: string,
): Promise<ActionResult<InventoryAdjustment>> {
  return wrapAction(async () => {
    const { orgId, userId, role } = await getAuthenticatedContext();
    assertCan(role, 'complete', 'inventory');

    if (!adjustmentId.trim()) {
      throw new DomainError('VALIDATION_ERROR', 'Inventory adjustment was not found');
    }

    return inventoryAdjustmentService.complete(orgId, adjustmentId.trim(), userId);
  });
}
