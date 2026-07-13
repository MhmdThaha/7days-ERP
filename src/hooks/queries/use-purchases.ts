'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listPurchasesAction } from '@/actions/purchases';
import { PURCHASE_PAGE_SIZE } from '@/lib/domain/constants/purchase';
import type { PurchaseListParams } from '@/types/purchase';

export function usePurchases(params: PurchaseListParams) {
  return useQuery({
    queryKey: ['purchases', params],
    queryFn: async () => {
      const result = await listPurchasesAction({
        search: params.search,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? PURCHASE_PAGE_SIZE,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    placeholderData: keepPreviousData,
  });
}
