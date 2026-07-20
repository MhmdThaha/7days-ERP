'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listProductionsAction } from '@/actions/production';
import { PRODUCTION_PAGE_SIZE } from '@/lib/domain/constants/production';
import type { ProductionListParams } from '@/types/production';

export function useProductions(params: ProductionListParams) {
  return useQuery({
    queryKey: ['productions', params],
    queryFn: async () => {
      const result = await listProductionsAction({
        search: params.search,
        status: params.status,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? PRODUCTION_PAGE_SIZE,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    placeholderData: keepPreviousData,
  });
}
