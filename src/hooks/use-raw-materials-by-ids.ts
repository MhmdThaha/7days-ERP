'use client';

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';

import { getRawMaterialAction } from '@/actions/raw-materials';
import { useAuth } from '@/hooks/use-auth';
import { toRawMaterialListItem } from '@/lib/utils/catalog-list-item';
import type { RawMaterialListItem } from '@/types/raw-material';

export function useRawMaterialsByIds(rawMaterialIds: string[]) {
  const { user, isAuthenticated } = useAuth();

  const uniqueIds = useMemo(
    () => [...new Set(rawMaterialIds.filter(Boolean))].sort(),
    [rawMaterialIds],
  );

  const queries = useQueries({
    queries: uniqueIds.map((id) => ({
      queryKey: ['raw-material', user?.uid, id],
      queryFn: async () => {
        const result = await getRawMaterialAction(id);

        if (!result.success) {
          throw new Error(result.error);
        }

        return toRawMaterialListItem(result.data);
      },
      enabled: isAuthenticated,
      staleTime: 5 * 60 * 1000,
    })),
  });

  const rawMaterialsById = useMemo(() => {
    const map = new Map<string, RawMaterialListItem>();

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
    rawMaterialsById,
    isLoading,
    isFetching,
  };
}
