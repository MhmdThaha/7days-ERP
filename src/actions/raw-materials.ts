'use server';

import {
  createRawMaterialSchema,
  rawMaterialListParamsSchema,
  updateRawMaterialSchema,
} from '@/lib/domain/schemas/raw-material.schema';
import { DomainError } from '@/lib/domain/errors';
import { assertCan } from '@/lib/domain/permissions';
import { getAuthenticatedContext } from '@/lib/firebase/auth-server';
import { rawMaterialService } from '@/lib/services/raw-material.service';
import { wrapAction, type ActionResult } from '@/lib/utils/action-result';
import type {
  CreateRawMaterialInput,
  RawMaterial,
  RawMaterialListParams,
  RawMaterialListResult,
  UpdateRawMaterialInput,
} from '@/types/raw-material';

export async function listRawMaterialsAction(
  params: RawMaterialListParams,
): Promise<ActionResult<RawMaterialListResult>> {
  return wrapAction(async () => {
    const { orgId, role } = await getAuthenticatedContext();
    assertCan(role, 'read', 'rawMaterial');
    const validated = rawMaterialListParamsSchema.parse(params);
    return rawMaterialService.list(orgId, validated);
  });
}

export async function getRawMaterialAction(rawMaterialId: string): Promise<ActionResult<RawMaterial>> {
  return wrapAction(async () => {
    const { orgId, role } = await getAuthenticatedContext();
    assertCan(role, 'read', 'rawMaterial');
    return rawMaterialService.getById(orgId, rawMaterialId);
  });
}

export async function getRawMaterialsByIdsAction(
  rawMaterialIds: string[],
): Promise<ActionResult<RawMaterial[]>> {
  return wrapAction(async () => {
    const { orgId, role } = await getAuthenticatedContext();
    assertCan(role, 'read', 'rawMaterial');

    const uniqueIds = [...new Set(rawMaterialIds.filter(Boolean))];

    if (uniqueIds.length === 0) {
      return [];
    }

    const settled = await Promise.allSettled(
      uniqueIds.map((id) => rawMaterialService.getById(orgId, id)),
    );

    return settled
      .filter(
        (result): result is PromiseFulfilledResult<RawMaterial> => result.status === 'fulfilled',
      )
      .map((result) => result.value);
  });
}

export async function createRawMaterialAction(
  input: CreateRawMaterialInput,
): Promise<ActionResult<RawMaterial>> {
  return wrapAction(async () => {
    const { orgId, userId, role } = await getAuthenticatedContext();
    assertCan(role, 'create', 'rawMaterial');
    const validated = createRawMaterialSchema.parse({
      ...input,
      code: input.code ?? '',
      description: input.description ?? null,
      reorderLevel: input.reorderLevel ?? null,
      isActive: input.isActive ?? true,
    });

    return rawMaterialService.create(
      orgId,
      {
        code: validated.code,
        name: validated.name,
        category: validated.category,
        unit: validated.unit,
        reorderLevel: validated.reorderLevel ?? null,
        description: validated.description ?? null,
        isActive: validated.isActive,
      },
      userId,
    );
  });
}

export async function updateRawMaterialAction(
  rawMaterialId: string,
  input: UpdateRawMaterialInput,
): Promise<ActionResult<RawMaterial>> {
  return wrapAction(async () => {
    const { orgId, userId, role } = await getAuthenticatedContext();
    assertCan(role, 'update', 'rawMaterial');
    const validated = updateRawMaterialSchema.parse({
      ...input,
      code: input.code ?? undefined,
    });

    if (Object.keys(validated).length === 0) {
      throw new DomainError('VALIDATION_ERROR', 'No changes provided');
    }

    return rawMaterialService.update(orgId, rawMaterialId, validated, userId);
  });
}

export async function deleteRawMaterialAction(rawMaterialId: string): Promise<ActionResult<void>> {
  return wrapAction(async () => {
    const { orgId, userId, role } = await getAuthenticatedContext();
    assertCan(role, 'delete', 'rawMaterial');
    await rawMaterialService.softDelete(orgId, rawMaterialId, userId);
  });
}
