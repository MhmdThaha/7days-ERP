'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listReturnsAction } from '@/actions/returns';
import { RETURN_PAGE_SIZE } from '@/lib/domain/constants/return';
import type { ReturnListParams } from '@/types/return';

export function useReturns(params: ReturnListParams) {
  return useQuery({
    queryKey: ['returns', params],
    queryFn: async () => {
      const result = await listReturnsAction({
        search: params.search,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? RETURN_PAGE_SIZE,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    placeholderData: keepPreviousData,
  });
}
