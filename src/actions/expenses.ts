'use server';

import {
  createExpenseSchema,
  expenseListParamsSchema,
  updateExpenseSchema,
} from '@/lib/domain/schemas/expense.schema';
import { DomainError } from '@/lib/domain/errors';
import { getServerOrgContext } from '@/lib/firebase/auth-server';
import { expenseService } from '@/lib/services/expense.service';
import { wrapAction, type ActionResult } from '@/lib/utils/action-result';
import type {
  CreateExpenseInput,
  Expense,
  ExpenseListParams,
  ExpenseListResult,
  UpdateExpenseInput,
} from '@/types/expense';

export async function listExpensesAction(
  params: ExpenseListParams,
): Promise<ActionResult<ExpenseListResult>> {
  return wrapAction(async () => {
    const { orgId } = await getServerOrgContext();
    const validated = expenseListParamsSchema.parse(params);
    return expenseService.list(orgId, validated);
  });
}

export async function getExpenseAction(expenseId: string): Promise<ActionResult<Expense>> {
  return wrapAction(async () => {
    const { orgId } = await getServerOrgContext();
    return expenseService.getById(orgId, expenseId);
  });
}

export async function createExpenseAction(
  input: CreateExpenseInput,
): Promise<ActionResult<Expense>> {
  return wrapAction(async () => {
    const { orgId, userId } = await getServerOrgContext();
    const validated = createExpenseSchema.parse({
      ...input,
      notes: input.notes ?? null,
    });

    return expenseService.create(
      orgId,
      {
        expenseDate: validated.expenseDate,
        category: validated.category,
        amount: validated.amount,
        notes: validated.notes ?? null,
      },
      userId,
    );
  });
}

export async function updateExpenseAction(
  expenseId: string,
  input: UpdateExpenseInput,
): Promise<ActionResult<Expense>> {
  return wrapAction(async () => {
    const { orgId, userId } = await getServerOrgContext();
    const validated = updateExpenseSchema.parse({
      ...input,
      notes: input.notes ?? undefined,
    });

    if (Object.keys(validated).length === 0) {
      throw new DomainError('VALIDATION_ERROR', 'No changes provided');
    }

    return expenseService.update(orgId, expenseId, validated, userId);
  });
}

export async function deleteExpenseAction(expenseId: string): Promise<ActionResult<void>> {
  return wrapAction(async () => {
    const { orgId, userId } = await getServerOrgContext();
    await expenseService.softDelete(orgId, expenseId, userId);
  });
}

export async function completeExpenseAction(expenseId: string): Promise<ActionResult<Expense>> {
  return wrapAction(async () => {
    const { orgId, userId } = await getServerOrgContext();
    return expenseService.complete(orgId, expenseId, userId);
  });
}
