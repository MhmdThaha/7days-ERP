'use client';

import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/use-auth';
import {
  fetchRawMaterialsMap,
  PRODUCTION_PREVIEW_STALE_TIME,
  rawMaterialsByIdsQueryKey,
} from '@/lib/utils/production-preview-cache';
import type { RawMaterialListItem } from '@/types/raw-material';

const EMPTY_RAW_MATERIALS = new Map<string, RawMaterialListItem>();

export function useRawMaterialsByIds(rawMaterialIds: string[]) {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const uniqueIds = useMemo(
    () => [...new Set(rawMaterialIds.filter(Boolean))].sort(),
    [rawMaterialIds],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: rawMaterialsByIdsQueryKey(user?.uid, uniqueIds),
    queryFn: () => fetchRawMaterialsMap(uniqueIds, user?.uid, queryClient),
    enabled: isAuthenticated && uniqueIds.length > 0,
    staleTime: PRODUCTION_PREVIEW_STALE_TIME,
  });

  return {
    rawMaterialsById: data ?? EMPTY_RAW_MATERIALS,
    isLoading,
    isFetching,
  };
}
