'use server';

import {
  createWastageSchema,
  updateWastageSchema,
  wastageListParamsSchema,
} from '@/lib/domain/schemas/wastage.schema';
import { DomainError } from '@/lib/domain/errors';
import { getServerOrgContext } from '@/lib/firebase/auth-server';
import { wastageService } from '@/lib/services/wastage.service';
import { wrapAction, type ActionResult } from '@/lib/utils/action-result';
import type {
  CreateWastageInput,
  UpdateWastageInput,
  Wastage,
  WastageListParams,
  WastageListResult,
} from '@/types/wastage';

export async function listWastageAction(
  params: WastageListParams,
): Promise<ActionResult<WastageListResult>> {
  return wrapAction(async () => {
    const { orgId } = await getServerOrgContext();
    const validated = wastageListParamsSchema.parse(params);
    return wastageService.list(orgId, validated);
  });
}

export async function getWastageAction(wastageId: string): Promise<ActionResult<Wastage>> {
  return wrapAction(async () => {
    const { orgId } = await getServerOrgContext();
    return wastageService.getById(orgId, wastageId);
  });
}

export async function createWastageAction(
  input: CreateWastageInput,
): Promise<ActionResult<Wastage>> {
  return wrapAction(async () => {
    const { orgId, userId } = await getServerOrgContext();
    const validated = createWastageSchema.parse({
      ...input,
      notes: input.notes ?? null,
    });

    return wastageService.create(
      orgId,
      {
        wastageDate: validated.wastageDate,
        reason: validated.reason,
        lines: validated.lines,
        notes: validated.notes ?? null,
      },
      userId,
    );
  });
}

export async function updateWastageAction(
  wastageId: string,
  input: UpdateWastageInput,
): Promise<ActionResult<Wastage>> {
  return wrapAction(async () => {
    const { orgId, userId } = await getServerOrgContext();
    const validated = updateWastageSchema.parse({
      ...input,
      notes: input.notes ?? undefined,
    });

    if (Object.keys(validated).length === 0) {
      throw new DomainError('VALIDATION_ERROR', 'No changes provided');
    }

    return wastageService.update(orgId, wastageId, validated, userId);
  });
}

export async function deleteWastageAction(wastageId: string): Promise<ActionResult<void>> {
  return wrapAction(async () => {
    const { orgId, userId } = await getServerOrgContext();
    await wastageService.softDelete(orgId, wastageId, userId);
  });
}

export async function completeWastageAction(wastageId: string): Promise<ActionResult<Wastage>> {
  return wrapAction(async () => {
    const { orgId, userId } = await getServerOrgContext();
    return wastageService.complete(orgId, wastageId, userId);
  });
}
