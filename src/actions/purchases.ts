'use server';

import {
  createPurchaseSchema,
  purchaseListParamsSchema,
  updatePurchaseSchema,
} from '@/lib/domain/schemas/purchase.schema';
import { DomainError } from '@/lib/domain/errors';
import { getServerOrgContext } from '@/lib/firebase/auth-server';
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
    const { orgId } = await getServerOrgContext();
    const validated = purchaseListParamsSchema.parse(params);
    return purchaseService.list(orgId, validated);
  });
}

export async function getPurchaseAction(purchaseId: string): Promise<ActionResult<Purchase>> {
  return wrapAction(async () => {
    const { orgId } = await getServerOrgContext();
    return purchaseService.getById(orgId, purchaseId);
  });
}

export async function createPurchaseAction(
  input: CreatePurchaseInput,
): Promise<ActionResult<Purchase>> {
  return wrapAction(async () => {
    const { orgId, userId } = await getServerOrgContext();
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
    const { orgId, userId } = await getServerOrgContext();
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
    const { orgId, userId } = await getServerOrgContext();
    await purchaseService.softDelete(orgId, purchaseId, userId);
  });
}

export async function receivePurchaseAction(purchaseId: string): Promise<ActionResult<Purchase>> {
  return wrapAction(async () => {
    const { orgId, userId } = await getServerOrgContext();
    return purchaseService.receive(orgId, purchaseId, userId);
  });
}
