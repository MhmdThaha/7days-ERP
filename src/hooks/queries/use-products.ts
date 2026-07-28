'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listProductsAction } from '@/actions/products';
import { useAuth } from '@/hooks/use-auth';
import { PRODUCT_PAGE_SIZE } from '@/lib/domain/constants/product';
import type { ProductListParams } from '@/types/product';

export function useProducts(params: ProductListParams) {
  const { user, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ['products', user?.uid, params],
    queryFn: async () => {
      const result = await listProductsAction({
        search: params.search,
        status: params.status ?? 'active',
        page: params.page ?? 1,
        pageSize: params.pageSize ?? PRODUCT_PAGE_SIZE,
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
