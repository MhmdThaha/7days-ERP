'use server';

import {
  createSaleSchema,
  saleListParamsSchema,
  updateSaleSchema,
} from '@/lib/domain/schemas/sale.schema';
import { DomainError } from '@/lib/domain/errors';
import { getServerOrgContext } from '@/lib/firebase/auth-server';
import { saleService } from '@/lib/services/sale.service';
import { wrapAction, type ActionResult } from '@/lib/utils/action-result';
import type {
  CreateSaleInput,
  Sale,
  SaleListParams,
  SaleListResult,
  UpdateSaleInput,
} from '@/types/sale';

export async function listSalesAction(
  params: SaleListParams,
): Promise<ActionResult<SaleListResult>> {
  return wrapAction(async () => {
    const { orgId } = await getServerOrgContext();
    const validated = saleListParamsSchema.parse(params);
    return saleService.list(orgId, validated);
  });
}

export async function getSaleAction(saleId: string): Promise<ActionResult<Sale>> {
  return wrapAction(async () => {
    const { orgId } = await getServerOrgContext();
    return saleService.getById(orgId, saleId);
  });
}

export async function createSaleAction(input: CreateSaleInput): Promise<ActionResult<Sale>> {
  return wrapAction(async () => {
    const { orgId, userId } = await getServerOrgContext();
    const validated = createSaleSchema.parse({
      ...input,
      notes: input.notes ?? null,
    });

    return saleService.create(
      orgId,
      {
        saleDate: validated.saleDate,
        customerName: validated.customerName ?? null,
        lines: validated.lines,
        notes: validated.notes ?? null,
      },
      userId,
    );
  });
}

export async function updateSaleAction(
  saleId: string,
  input: UpdateSaleInput,
): Promise<ActionResult<Sale>> {
  return wrapAction(async () => {
    const { orgId, userId } = await getServerOrgContext();
    const validated = updateSaleSchema.parse({
      ...input,
      notes: input.notes ?? undefined,
    });

    if (Object.keys(validated).length === 0) {
      throw new DomainError('VALIDATION_ERROR', 'No changes provided');
    }

    return saleService.update(orgId, saleId, validated, userId);
  });
}

export async function deleteSaleAction(saleId: string): Promise<ActionResult<void>> {
  return wrapAction(async () => {
    const { orgId, userId } = await getServerOrgContext();
    await saleService.softDelete(orgId, saleId, userId);
  });
}

export async function completeSaleAction(saleId: string): Promise<ActionResult<Sale>> {
  return wrapAction(async () => {
    const { orgId, userId } = await getServerOrgContext();
    return saleService.complete(orgId, saleId, userId);
  });
}
