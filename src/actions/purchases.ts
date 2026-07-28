'use server';

import {
  createPurchaseSchema,
  purchaseListParamsSchema,
  updatePurchaseSchema,
} from '@/lib/domain/schemas/purchase.schema';
import { DomainError } from '@/lib/domain/errors';
import { assertCan } from '@/lib/domain/permissions';
import { getAuthenticatedContext } from '@/lib/firebase/auth-server';
import { purchaseService } from '@/lib/services/purchase.service';
import { wrapAction, type ActionResult } from '@/lib/utils/action-result';
import type {
  CreatePurchaseInput,
  Purchase,
  PurchaseListParams,
  PurchaseListResult,
  UpdatePurchaseInput,
} from '@/types/purchase';

export async function listPurchasesAction(
  params: PurchaseListParams,
): Promise<ActionResult<PurchaseListResult>> {
  return wrapAction(async () => {
    const { orgId, role } = await getAuthenticatedContext();
    assertCan(role, 'read', 'purchase');
    const validated = purchaseListParamsSchema.parse(params);
    return purchaseService.list(orgId, validated);
  });
}

export async function getPurchaseAction(purchaseId: string): Promise<ActionResult<Purchase>> {
  return wrapAction(async () => {
    const { orgId, role } = await getAuthenticatedContext();
    assertCan(role, 'read', 'purchase');
    return purchaseService.getById(orgId, purchaseId);
  });
}

export async function createPurchaseAction(input: CreatePurchaseInput): Promise<ActionResult<Purchase>> {
  return wrapAction(async () => {
    const { orgId, userId, role } = await getAuthenticatedContext();
    assertCan(role, 'create', 'purchase');
    const validated = createPurchaseSchema.parse({
      ...input,
      invoiceNumber: input.invoiceNumber ?? null,
      notes: input.notes ?? null,
    });

    return purchaseService.create(
      orgId,
      {
        purchaseDate: validated.purchaseDate,
        supplierName: validated.supplierName,
        invoiceNumber: validated.invoiceNumber ?? null,
        paymentStatus: validated.paymentStatus,
        lineItems: validated.lineItems,
        notes: validated.notes ?? null,
      },
      userId,
    );
  });
}

export async function updatePurchaseAction(
  purchaseId: string,
  input: UpdatePurchaseInput,
): Promise<ActionResult<Purchase>> {
  return wrapAction(async () => {
    const { orgId, userId, role } = await getAuthenticatedContext();
    assertCan(role, 'update', 'purchase');
    const validated = updatePurchaseSchema.parse({
      ...input,
      invoiceNumber: input.invoiceNumber ?? undefined,
      notes: input.notes ?? undefined,
    });

    if (Object.keys(validated).length === 0) {
      throw new DomainError('VALIDATION_ERROR', 'No changes provided');
    }

    return purchaseService.update(orgId, purchaseId, validated, userId);
  });
}

export async function deletePurchaseAction(purchaseId: string): Promise<ActionResult<void>> {
  return wrapAction(async () => {
    const { orgId, userId, role } = await getAuthenticatedContext();
    assertCan(role, 'delete', 'purchase');
    await purchaseService.softDelete(orgId, purchaseId, userId);
  });
}

export async function receivePurchaseAction(purchaseId: string): Promise<ActionResult<Purchase>> {
  return wrapAction(async () => {
    const { orgId, userId, role } = await getAuthenticatedContext();
    assertCan(role, 'complete', 'purchase');
    return purchaseService.receive(orgId, purchaseId, userId);
  });
}
