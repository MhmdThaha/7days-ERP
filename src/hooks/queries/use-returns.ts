'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listReturnsAction } from '@/actions/returns';
import { useAuth } from '@/hooks/use-auth';
import { RETURN_PAGE_SIZE } from '@/lib/domain/constants/return';
import type { ReturnListParams } from '@/types/return';

export function useReturns(params: ReturnListParams) {
  const { user, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ['returns', user?.uid, params],
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
    enabled: isAuthenticated,
    placeholderData: keepPreviousData,
  });
}
