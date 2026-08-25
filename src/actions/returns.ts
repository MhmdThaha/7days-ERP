'use server';

import {
  createReturnSchema,
  returnListParamsSchema,
  updateReturnSchema,
} from '@/lib/domain/schemas/return.schema';
import { DomainError } from '@/lib/domain/errors';
import { assertCan } from '@/lib/domain/permissions';
import { getAuthenticatedContext } from '@/lib/firebase/auth-server';
import { returnService } from '@/lib/services/return.service';
import { wrapAction, type ActionResult } from '@/lib/utils/action-result';
import type {
  CreateReturnInput,
  ReturnEntry,
  ReturnListParams,
  ReturnListResult,
  SaleReturnContext,
  UpdateReturnInput,
} from '@/types/return';

export async function listReturnsAction(
  params: ReturnListParams,
): Promise<ActionResult<ReturnListResult>> {
  return wrapAction(async () => {
    const { orgId, role } = await getAuthenticatedContext();
    assertCan(role, 'read', 'return');
    const validated = returnListParamsSchema.parse(params);
    return returnService.list(orgId, validated);
  });
}

export async function getReturnAction(returnId: string): Promise<ActionResult<ReturnEntry>> {
  return wrapAction(async () => {
    const { orgId, role } = await getAuthenticatedContext();
    assertCan(role, 'read', 'return');
    return returnService.getById(orgId, returnId);
  });
}

export async function getSaleReturnContextAction(
  saleId: string,
): Promise<ActionResult<SaleReturnContext>> {
  return wrapAction(async () => {
    const { orgId, role } = await getAuthenticatedContext();
    assertCan(role, 'read', 'return');
    return returnService.getSaleReturnContext(orgId, saleId);
  });
}

export async function createReturnAction(input: CreateReturnInput): Promise<ActionResult<ReturnEntry>> {
  return wrapAction(async () => {
    const { orgId, userId, role } = await getAuthenticatedContext();
    assertCan(role, 'create', 'return');
    const validated = createReturnSchema.parse({
      ...input,
      notes: input.notes ?? null,
    });

    return returnService.create(
      orgId,
      {
        sourceSaleId: validated.sourceSaleId,
        returnDate: validated.returnDate,
        reason: validated.reason,
        lines: validated.lines,
        notes: validated.notes ?? null,
      },
      userId,
    );
  });
}

export async function updateReturnAction(
  returnId: string,
  input: UpdateReturnInput,
): Promise<ActionResult<ReturnEntry>> {
  return wrapAction(async () => {
    const { orgId, userId, role } = await getAuthenticatedContext();
    assertCan(role, 'update', 'return');
    const validated = updateReturnSchema.parse({
      ...input,
      notes: input.notes ?? undefined,
    });

    if (Object.keys(validated).length === 0) {
      throw new DomainError('VALIDATION_ERROR', 'No changes provided');
    }

    return returnService.update(orgId, returnId, validated, userId);
  });
}

export async function deleteReturnAction(returnId: string): Promise<ActionResult<void>> {
  return wrapAction(async () => {
    const { orgId, userId, role } = await getAuthenticatedContext();
    assertCan(role, 'delete', 'return');
    await returnService.softDelete(orgId, returnId, userId);
  });
}

export async function completeReturnAction(returnId: string): Promise<ActionResult<ReturnEntry>> {
  return wrapAction(async () => {
    const { orgId, userId, role } = await getAuthenticatedContext();
    assertCan(role, 'complete', 'return');
    return returnService.complete(orgId, returnId, userId);
  });
}
