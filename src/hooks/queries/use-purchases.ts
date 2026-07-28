'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listPurchasesAction } from '@/actions/purchases';
import { useAuth } from '@/hooks/use-auth';
import { PURCHASE_PAGE_SIZE } from '@/lib/domain/constants/purchase';
import type { PurchaseListParams } from '@/types/purchase';

export function usePurchases(params: PurchaseListParams) {
  const { user, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ['purchases', user?.uid, params],
    queryFn: async () => {
      const result = await listPurchasesAction({
        search: params.search,
        status: params.status,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? PURCHASE_PAGE_SIZE,
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
