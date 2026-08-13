'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listSalesPageAction } from '@/actions/sales';
import { useAuth } from '@/hooks/use-auth';
import { SALE_PAGE_SIZE } from '@/lib/domain/constants/sale';
import type { SaleListPageParams, SaleListPageResult } from '@/types/sale';

export function useSales(params: SaleListPageParams) {
  const { user, isAuthenticated } = useAuth();

  return useQuery<SaleListPageResult>({
    queryKey: ['sales', user?.uid, params],
    queryFn: async () => {
      const result = await listSalesPageAction({
        search: params.search,
        status: params.status,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? SALE_PAGE_SIZE,
        position: params.position ?? 'first',
        cursor: params.cursor,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    enabled: isAuthenticated,
    placeholderData: keepPreviousData,
  });
}
