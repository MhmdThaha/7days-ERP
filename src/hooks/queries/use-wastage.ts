'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listWastageAction } from '@/actions/wastage';
import { WASTAGE_PAGE_SIZE } from '@/lib/domain/constants/wastage';
import type { WastageListParams } from '@/types/wastage';

export function useWastage(params: WastageListParams) {
  return useQuery({
    queryKey: ['wastage', params],
    queryFn: async () => {
      const result = await listWastageAction({
        search: params.search,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? WASTAGE_PAGE_SIZE,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    placeholderData: keepPreviousData,
  });
}
