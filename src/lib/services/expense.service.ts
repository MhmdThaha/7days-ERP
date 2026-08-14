import 'server-only';

import { EXPENSE_NUMBER_PREFIX } from '@/lib/domain/constants/expense';
import { DomainError } from '@/lib/domain/errors';
import { expenseRepository } from '@/lib/repositories/expense.repository';
import { dailySummaryService } from '@/lib/services/daily-summary.service';
import type {
  CreateExpenseInput,
  Expense,
  ExpenseListParams,
  ExpenseListResult,
  UpdateExpenseInput,
} from '@/types/expense';

function formatGeneratedNumber(sequence: number): string {
  return `${EXPENSE_NUMBER_PREFIX}-${String(sequence).padStart(3, '0')}`;
}

async function resolveExpenseNumber(orgId: string): Promise<string> {
  const highest = await expenseRepository.getHighestExpenseNumber(orgId);
  let next = highest + 1;
  let generated = formatGeneratedNumber(next);

  while (await expenseRepository.findByExpenseNumber(orgId, generated)) {
    next += 1;
    generated = formatGeneratedNumber(next);
  }

  return generated;
}

function assertDraftExpense(expense: Expense): void {
  if (expense.status !== 'draft') {
    throw new DomainError('VALIDATION_ERROR', 'Only draft expenses can be modified');
  }
}

export const expenseService = {
  async list(orgId: string, params: ExpenseListParams): Promise<ExpenseListResult> {
    return expenseRepository.list(orgId, params);
  },

  async getById(orgId: string, expenseId: string): Promise<Expense> {
    const expense = await expenseRepository.getById(orgId, expenseId);

    if (!expense) {
      throw new DomainError('NOT_FOUND', 'Expense not found');
    }

    return expense;
  },

  async create(orgId: string, input: CreateExpenseInput, userId: string): Promise<Expense> {
    const expenseNumber = await resolveExpenseNumber(orgId);

    return expenseRepository.create(
      orgId,
      {
        expenseNumber,
        expenseDate: input.expenseDate,
        category: input.category,
        amount: input.amount,
        notes: input.notes,
      },
      userId,
    );
  },

  async update(
    orgId: string,
    expenseId: string,
    input: UpdateExpenseInput,
    userId: string,
  ): Promise<Expense> {
    const existing = await expenseRepository.getById(orgId, expenseId);

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Expense not found');
    }

    assertDraftExpense(existing);

    return expenseRepository.update(orgId, expenseId, input, userId);
  },

  async softDelete(orgId: string, expenseId: string, userId: string): Promise<void> {
    const existing = await expenseRepository.getById(orgId, expenseId);

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Expense not found');
    }

    assertDraftExpense(existing);

    await expenseRepository.softDelete(orgId, expenseId, userId);
  },

  async complete(orgId: string, expenseId: string, userId: string): Promise<Expense> {
    const existing = await expenseRepository.getById(orgId, expenseId);

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Expense not found');
    }

    assertDraftExpense(existing);

    const completed = await expenseRepository.complete(orgId, expenseId, userId);
    await dailySummaryService.recalculateAfterMutation(orgId, completed.expenseDate);
    return completed;
  },
};
