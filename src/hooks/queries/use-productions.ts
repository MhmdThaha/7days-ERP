'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listProductionsPageAction } from '@/actions/production';
import { useAuth } from '@/hooks/use-auth';
import { PRODUCTION_PAGE_SIZE } from '@/lib/domain/constants/production';
import type { ProductionListPageParams, ProductionListPageResult } from '@/types/production';

export function useProductions(params: ProductionListPageParams) {
  const { user, isAuthenticated } = useAuth();

  return useQuery<ProductionListPageResult>({
    queryKey: ['productions', user?.uid, params],
    queryFn: async () => {
      const result = await listProductionsPageAction({
        search: params.search,
        status: params.status,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? PRODUCTION_PAGE_SIZE,
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
