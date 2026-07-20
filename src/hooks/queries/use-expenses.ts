'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listExpensesAction } from '@/actions/expenses';
import { EXPENSE_PAGE_SIZE } from '@/lib/domain/constants/expense';
import type { ExpenseListParams } from '@/types/expense';

export function useExpenses(params: ExpenseListParams) {
  return useQuery({
    queryKey: ['expenses', params],
    queryFn: async () => {
      const result = await listExpensesAction({
        search: params.search,
        category: params.category,
        status: params.status,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? EXPENSE_PAGE_SIZE,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    placeholderData: keepPreviousData,
  });
}
