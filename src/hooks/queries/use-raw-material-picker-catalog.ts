'use client';

import { useQuery } from '@tanstack/react-query';

import { listRawMaterialsAction } from '@/actions/raw-materials';
import { useAuth } from '@/hooks/use-auth';
import type { RawMaterialListResult, RawMaterialStatusFilter } from '@/types/raw-material';

/** Max page size allowed by raw material list validation. */
const PICKER_CATALOG_PAGE_SIZE = 100;

const CATALOG_STALE_TIME_MS = 5 * 60 * 1000;

export function rawMaterialPickerCatalogQueryKey(status: RawMaterialStatusFilter) {
  return ['raw-materials', 'picker-catalog', status] as const;
}

export function useRawMaterialPickerCatalog(status: RawMaterialStatusFilter = 'active') {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: rawMaterialPickerCatalogQueryKey(status),
    queryFn: async (): Promise<RawMaterialListResult> => {
      const result = await listRawMaterialsAction({
        status,
        page: 1,
        pageSize: PICKER_CATALOG_PAGE_SIZE,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    enabled: isAuthenticated,
    staleTime: CATALOG_STALE_TIME_MS,
  });
}

export function filterRawMaterialsBySearch<
  T extends { code: string; name: string; category: string },
>(items: readonly T[], search: string): T[] {
  const term = search.trim().toLowerCase();

  if (!term) {
    return [...items];
  }

  return items.filter((item) => {
    const haystack = `${item.code} ${item.name} ${item.category}`.toLowerCase();
    return haystack.includes(term);
  });
}

export function isRawMaterialCatalogComplete(catalog: RawMaterialListResult | undefined): boolean {
  if (!catalog) {
    return false;
  }

  return catalog.total <= catalog.pageSize;
}
