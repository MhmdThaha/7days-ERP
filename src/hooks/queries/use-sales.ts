'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listSalesAction } from '@/actions/sales';
import { SALE_PAGE_SIZE } from '@/lib/domain/constants/sale';
import type { SaleListParams } from '@/types/sale';

export function useSales(params: SaleListParams) {
  return useQuery({
    queryKey: ['sales', params],
    queryFn: async () => {
      const result = await listSalesAction({
        search: params.search,
        status: params.status,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? SALE_PAGE_SIZE,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    placeholderData: keepPreviousData,
  });
}
