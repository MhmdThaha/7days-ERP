'use server';

import {
  createProductionSchema,
  productionListParamsSchema,
  updateProductionSchema,
} from '@/lib/domain/schemas/production.schema';
import { DomainError } from '@/lib/domain/errors';
import { assertCan } from '@/lib/domain/permissions';
import { getAuthenticatedContext } from '@/lib/firebase/auth-server';
import { productionService } from '@/lib/services/production.service';
import { wrapAction, type ActionResult } from '@/lib/utils/action-result';
import type {
  CreateProductionInput,
  Production,
  ProductionListParams,
  ProductionListResult,
  UpdateProductionInput,
} from '@/types/production';

export async function listProductionsAction(
  params: ProductionListParams,
): Promise<ActionResult<ProductionListResult>> {
  return wrapAction(async () => {
    const { orgId, role } = await getAuthenticatedContext();
    assertCan(role, 'read', 'production');
    const validated = productionListParamsSchema.parse(params);
    return productionService.list(orgId, validated);
  });
}

export async function getProductionAction(productionId: string): Promise<ActionResult<Production>> {
  return wrapAction(async () => {
    const { orgId, role } = await getAuthenticatedContext();
    assertCan(role, 'read', 'production');
    return productionService.getById(orgId, productionId);
  });
}

export async function createProductionAction(
  input: CreateProductionInput,
): Promise<ActionResult<Production>> {
  return wrapAction(async () => {
    const { orgId, userId, role } = await getAuthenticatedContext();
    assertCan(role, 'create', 'production');
    const validated = createProductionSchema.parse({
      ...input,
      notes: input.notes ?? null,
    });

    return productionService.create(
      orgId,
      {
        productionDate: validated.productionDate,
        lines: validated.lines,
        notes: validated.notes ?? null,
      },
      userId,
    );
  });
}

export async function updateProductionAction(
  productionId: string,
  input: UpdateProductionInput,
): Promise<ActionResult<Production>> {
  return wrapAction(async () => {
    const { orgId, userId, role } = await getAuthenticatedContext();
    assertCan(role, 'update', 'production');
    const validated = updateProductionSchema.parse({
      ...input,
      notes: input.notes ?? undefined,
    });

    if (Object.keys(validated).length === 0) {
      throw new DomainError('VALIDATION_ERROR', 'No changes provided');
    }

    return productionService.update(orgId, productionId, validated, userId);
  });
}

export async function deleteProductionAction(productionId: string): Promise<ActionResult<void>> {
  return wrapAction(async () => {
    const { orgId, userId, role } = await getAuthenticatedContext();
    assertCan(role, 'delete', 'production');
    await productionService.softDelete(orgId, productionId, userId);
  });
}

export async function completeProductionAction(productionId: string): Promise<ActionResult<Production>> {
  return wrapAction(async () => {
    const { orgId, userId, role } = await getAuthenticatedContext();
    assertCan(role, 'complete', 'production');
    return productionService.complete(orgId, productionId, userId);
  });
}
