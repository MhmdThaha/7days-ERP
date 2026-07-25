'use client';

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';

import { getProductAction } from '@/actions/products';
import { toProductListItem } from '@/lib/utils/catalog-list-item';
import type { ProductListItem } from '@/types/product';

export function useProductsByIds(productIds: string[]) {
  const uniqueIds = useMemo(
    () => [...new Set(productIds.filter(Boolean))].sort(),
    [productIds],
  );

  const queries = useQueries({
    queries: uniqueIds.map((id) => ({
      queryKey: ['product', id],
      queryFn: async () => {
        const result = await getProductAction(id);

        if (!result.success) {
          throw new Error(result.error);
        }

        return toProductListItem(result.data);
      },
      staleTime: 5 * 60 * 1000,
    })),
  });

  const productsById = useMemo(() => {
    const map = new Map<string, ProductListItem>();

    queries.forEach((query, index) => {
      const id = uniqueIds[index];

      if (id && query.data) {
        map.set(id, query.data);
      }
    });

    return map;
  }, [queries, uniqueIds]);

  const isLoading = queries.some((query) => query.isLoading);
  const isFetching = queries.some((query) => query.isFetching);

  return {
    productsById,
    isLoading,
    isFetching,
  };
}
