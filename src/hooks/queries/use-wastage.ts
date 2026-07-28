'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listWastageAction } from '@/actions/wastage';
import { useAuth } from '@/hooks/use-auth';
import { WASTAGE_PAGE_SIZE } from '@/lib/domain/constants/wastage';
import type { WastageListParams } from '@/types/wastage';

export function useWastage(params: WastageListParams) {
  const { user, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ['wastage', user?.uid, params],
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
    enabled: isAuthenticated,
    placeholderData: keepPreviousData,
  });
}
