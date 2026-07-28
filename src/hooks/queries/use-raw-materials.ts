'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listRawMaterialsAction } from '@/actions/raw-materials';
import { useAuth } from '@/hooks/use-auth';
import { RAW_MATERIAL_PAGE_SIZE } from '@/lib/domain/constants/raw-material';
import type { RawMaterialListParams } from '@/types/raw-material';

export function useRawMaterials(params: RawMaterialListParams) {
  const { user, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ['raw-materials', user?.uid, params],
    queryFn: async () => {
      const result = await listRawMaterialsAction({
        search: params.search,
        status: params.status ?? 'active',
        category: params.category,
        lowStockOnly: params.lowStockOnly ?? false,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? RAW_MATERIAL_PAGE_SIZE,
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
