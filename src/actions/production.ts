'use server';

import {
  createProductionSchema,
  productionListPageParamsSchema,
  productionListParamsSchema,
  updateProductionSchema,
} from '@/lib/domain/schemas/production.schema';
import { DomainError } from '@/lib/domain/errors';
import { assertCan } from '@/lib/domain/permissions';
import { getAuthenticatedContext } from '@/lib/firebase/auth-server';
import { buildMaterialRowsFromRawOutMovements } from '@/lib/domain/calculations/production-materials';
import { inventoryMovementRepository } from '@/lib/repositories/inventory-movement.repository';
import { rawMaterialRepository } from '@/lib/repositories/raw-material.repository';
import { productionService } from '@/lib/services/production.service';
import { wrapAction, type ActionResult } from '@/lib/utils/action-result';
import type {
  CreateProductionInput,
  MaterialPreviewRow,
  Production,
  ProductionListItem,
  ProductionListPageParams,
  ProductionListPageResult,
  ProductionListParams,
  ProductionListResult,
  UpdateProductionInput,
} from '@/types/production';
import { toRawMaterialListItem } from '@/lib/utils/catalog-list-item';

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

/** Production page only — paginated when search is empty; legacy substring list when search is set. */
export async function listProductionsPageAction(
  params: ProductionListPageParams,
): Promise<ActionResult<ProductionListPageResult>> {
  return wrapAction(async () => {
    const { orgId, role } = await getAuthenticatedContext();
    assertCan(role, 'read', 'production');
    const validated = productionListPageParamsSchema.parse(params);
    return productionService.listPage(orgId, validated);
  });
}

export async function getLatestProductionForRepeatAction(): Promise<
  ActionResult<ProductionListItem | null>
> {
  return wrapAction(async () => {
    const { orgId, role } = await getAuthenticatedContext();
    assertCan(role, 'read', 'production');
    return productionService.getLatestForRepeat(orgId);
  });
}

export async function getProductionAction(productionId: string): Promise<ActionResult<Production>> {
  return wrapAction(async () => {
    const { orgId, role } = await getAuthenticatedContext();
    assertCan(role, 'read', 'production');
    return productionService.getById(orgId, productionId);
  });
}

export async function getProductionConsumedMaterialsAction(
  productionId: string,
): Promise<ActionResult<MaterialPreviewRow[]>> {
  return wrapAction(async () => {
    const { orgId, role } = await getAuthenticatedContext();
    assertCan(role, 'read', 'production');

    const production = await productionService.getById(orgId, productionId);

    if (production.status !== 'completed') {
      throw new DomainError('VALIDATION_ERROR', 'Production is not completed');
    }

    const movements = await inventoryMovementRepository.listBySourceDocument(
      orgId,
      'production',
      productionId,
    );
    const rawMaterialIds = [
      ...new Set(
        movements
          .filter((movement) => movement.movementType === 'PRODUCTION_RAW_OUT')
          .map((movement) => movement.itemId),
      ),
    ];
    const rawMaterials = await rawMaterialRepository.getByIds(orgId, rawMaterialIds);
    const rawMaterialsById = new Map(
      rawMaterials.map((rawMaterial) => [rawMaterial.id, toRawMaterialListItem(rawMaterial)]),
    );

    return buildMaterialRowsFromRawOutMovements(movements, rawMaterialsById);
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
