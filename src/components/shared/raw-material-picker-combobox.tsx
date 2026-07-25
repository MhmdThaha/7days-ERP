'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { getRawMaterialAction, listRawMaterialsAction } from '@/actions/raw-materials';
import { ItemCombobox, type ItemComboboxProps } from '@/components/shared/item-combobox';
import { Button } from '@/components/ui/button';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  ITEM_PICKER_DEBOUNCE_MS,
  ITEM_PICKER_PAGE_SIZE,
} from '@/lib/domain/constants/item-picker';
import {
  buildRawMaterialComboboxOptions,
  formatRawMaterialPickerLabel,
} from '@/lib/utils/item-combobox-options';
import { toRawMaterialListItem } from '@/lib/utils/catalog-list-item';
import { toUserFriendlyLoadError } from '@/lib/utils/user-friendly-error';
import type { RawMaterialListItem, RawMaterialStatusFilter } from '@/types/raw-material';

type RawMaterialPickerComboboxProps = Omit<
  ItemComboboxProps,
  'options' | 'filterOptions' | 'onQueryChange' | 'isLoadingOptions'
> & {
  disabledMaterialIds?: string[];
  excludeMaterialIds?: string[];
  filterMaterial?: (material: RawMaterialListItem) => boolean;
  status?: RawMaterialStatusFilter;
  /** When true, already-selected materials are hidden instead of disabled. */
  hideSelectedMaterials?: boolean;
};

export function RawMaterialPickerCombobox({
  value,
  disabledMaterialIds = [],
  excludeMaterialIds = [],
  filterMaterial,
  status = 'active',
  hideSelectedMaterials = false,
  placeholder = 'Search ingredient name or code…',
  emptyMessage = 'No ingredients match your search.',
  loadingMessage = 'Searching ingredients…',
  ...itemComboboxProps
}: RawMaterialPickerComboboxProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, ITEM_PICKER_DEBOUNCE_MS);

  const {
    data: searchResult,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['raw-materials', 'picker', status, debouncedSearch],
    queryFn: async () => {
      const result = await listRawMaterialsAction({
        status,
        search: debouncedSearch.trim() || undefined,
        page: 1,
        pageSize: ITEM_PICKER_PAGE_SIZE,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    placeholderData: keepPreviousData,
  });

  const { data: selectedMaterial } = useQuery({
    queryKey: ['raw-material', value],
    enabled: Boolean(value),
    queryFn: async () => {
      const result = await getRawMaterialAction(value!);

      if (!result.success) {
        throw new Error(result.error);
      }

      return toRawMaterialListItem(result.data);
    },
    staleTime: 5 * 60 * 1000,
  });

  const effectiveExcludeIds = useMemo(() => {
    const ids = new Set(excludeMaterialIds);

    if (hideSelectedMaterials) {
      for (const id of disabledMaterialIds) {
        if (id !== value) {
          ids.add(id);
        }
      }
    }

    return ids;
  }, [disabledMaterialIds, excludeMaterialIds, hideSelectedMaterials, value]);

  const pickerMaterials = useMemo(() => {
    let items = (searchResult?.items ?? []).filter(
      (material) => !effectiveExcludeIds.has(material.id),
    );

    if (filterMaterial) {
      items = items.filter(filterMaterial);
    }

    if (
      selectedMaterial &&
      !effectiveExcludeIds.has(selectedMaterial.id) &&
      (!filterMaterial || filterMaterial(selectedMaterial)) &&
      !items.some((material) => material.id === selectedMaterial.id)
    ) {
      items = [selectedMaterial, ...items];
    }

    return items;
  }, [effectiveExcludeIds, filterMaterial, searchResult?.items, selectedMaterial]);

  const options = useMemo(() => {
    if (hideSelectedMaterials) {
      return pickerMaterials.map((material) => ({
        value: material.id,
        label: formatRawMaterialPickerLabel(material),
        keywords: `${material.code} ${material.name} ${material.category}`,
      }));
    }

    return buildRawMaterialComboboxOptions(pickerMaterials, disabledMaterialIds);
  }, [disabledMaterialIds, hideSelectedMaterials, pickerMaterials]);

  const isSearching = searchQuery !== debouncedSearch;
  const searchErrorMessage =
    isError && error ? toUserFriendlyLoadError(error.message) : undefined;

  function handleRetrySearch() {
    void refetch();
  }

  return (
    <div className="space-y-1.5">
      <ItemCombobox
        value={value}
        options={options}
        placeholder={placeholder}
        emptyMessage={emptyMessage}
        loadingMessage={loadingMessage}
        filterOptions={false}
        onQueryChange={setSearchQuery}
        isLoadingOptions={isLoading || isFetching || isSearching}
        optionsErrorMessage={searchErrorMessage}
        onRetryOptions={searchErrorMessage ? handleRetrySearch : undefined}
        {...itemComboboxProps}
      />
      {searchErrorMessage ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-sm">
          <span className="text-destructive">{searchErrorMessage}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 border-destructive/30 bg-background"
            onClick={handleRetrySearch}
            disabled={isRefetching}
          >
            {isRefetching ? 'Retrying…' : 'Try again'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
