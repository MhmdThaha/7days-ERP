'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listPurchasesPageAction } from '@/actions/purchases';
import { useAuth } from '@/hooks/use-auth';
import { PURCHASE_PAGE_SIZE } from '@/lib/domain/constants/purchase';
import type { PurchaseListPageParams, PurchaseListPageResult } from '@/types/purchase';

export function usePurchases(params: PurchaseListPageParams) {
  const { user, isAuthenticated } = useAuth();

  return useQuery<PurchaseListPageResult>({
    queryKey: ['purchases', user?.uid, params],
    queryFn: async () => {
      const result = await listPurchasesPageAction({
        search: params.search,
        status: params.status,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? PURCHASE_PAGE_SIZE,
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
