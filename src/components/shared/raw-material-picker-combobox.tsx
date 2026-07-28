'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { getRawMaterialAction, listRawMaterialsAction } from '@/actions/raw-materials';
import { ItemCombobox, type ItemComboboxOption, type ItemComboboxProps } from '@/components/shared/item-combobox';
import { useAuth } from '@/hooks/use-auth';
import {
  filterRawMaterialsBySearch,
  isRawMaterialCatalogComplete,
  useRawMaterialPickerCatalog,
} from '@/hooks/queries/use-raw-material-picker-catalog';
import { Button } from '@/components/ui/button';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  ITEM_PICKER_DEBOUNCE_MS,
  ITEM_PICKER_PAGE_SIZE,
} from '@/lib/domain/constants/item-picker';
import {
  getFrequentRawMaterialIds,
  getRecentRawMaterialIds,
} from '@/lib/utils/form-recent-values';
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
  /** Called after a material is selected (for focus chaining). */
  onMaterialSelected?: (materialId: string) => void;
};

function buildSectionedOptions(
  materials: RawMaterialListItem[],
  disabledMaterialIds: string[],
  hideSelectedMaterials: boolean,
  recentIds: string[],
  frequentIds: string[],
  searchQuery: string,
): ItemComboboxOption[] {
  const materialById = new Map(materials.map((material) => [material.id, material]));
  const shownIds = new Set<string>();
  const options: ItemComboboxOption[] = [];

  function appendMaterial(material: RawMaterialListItem) {
    if (shownIds.has(material.id)) {
      return;
    }

    shownIds.add(material.id);

    if (hideSelectedMaterials) {
      options.push({
        value: material.id,
        label: formatRawMaterialPickerLabel(material),
        keywords: `${material.code} ${material.name} ${material.category}`,
      });
      return;
    }

    const built = buildRawMaterialComboboxOptions([material], disabledMaterialIds);

    if (built[0]) {
      options.push(built[0]);
    }
  }

  const showSections = !searchQuery.trim();

  if (showSections) {
    const recentMaterials = recentIds
      .map((id) => materialById.get(id))
      .filter((material): material is RawMaterialListItem => Boolean(material));

    if (recentMaterials.length > 0) {
      options.push({
        value: '__section_recent__',
        label: 'Recently Used',
        isSectionHeader: true,
      });

      for (const material of recentMaterials) {
        appendMaterial(material);
      }
    }

    const frequentMaterials = frequentIds
      .map((id) => materialById.get(id))
      .filter((material): material is RawMaterialListItem => Boolean(material));

    if (frequentMaterials.length > 0) {
      options.push({
        value: '__section_frequent__',
        label: 'Frequently Used',
        isSectionHeader: true,
      });

      for (const material of frequentMaterials) {
        appendMaterial(material);
      }
    }

    const remainingMaterials = materials.filter((material) => !shownIds.has(material.id));

    if (remainingMaterials.length > 0) {
      if (options.length > 0) {
        options.push({
          value: '__section_all__',
          label: 'All Materials',
          isSectionHeader: true,
        });
      }

      for (const material of remainingMaterials) {
        appendMaterial(material);
      }
    }

    return options;
  }

  if (hideSelectedMaterials) {
    return materials.map((material) => ({
      value: material.id,
      label: formatRawMaterialPickerLabel(material),
      keywords: `${material.code} ${material.name} ${material.category}`,
    }));
  }

  return buildRawMaterialComboboxOptions(materials, disabledMaterialIds);
}

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
  onMaterialSelected,
  onValueChange,
  ...itemComboboxProps
}: RawMaterialPickerComboboxProps) {
  const { isAuthenticated } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, ITEM_PICKER_DEBOUNCE_MS);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [frequentIds, setFrequentIds] = useState<string[]>([]);

  const {
    data: catalog,
    isLoading: isCatalogLoading,
    isError: isCatalogError,
    error: catalogError,
    refetch: refetchCatalog,
    isRefetching: isRefetchingCatalog,
  } = useRawMaterialPickerCatalog(status);

  const catalogComplete = isRawMaterialCatalogComplete(catalog);
  const useLocalCatalog = catalogComplete && !isCatalogLoading;

  const {
    data: searchResult,
    isLoading: isServerLoading,
    isFetching: isServerFetching,
    isError: isServerError,
    error: serverError,
    refetch: refetchServer,
    isRefetching: isRefetchingServer,
  } = useQuery({
    queryKey: ['raw-materials', 'picker', status, debouncedSearch],
    enabled: isAuthenticated && !useLocalCatalog,
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
    enabled: isAuthenticated && Boolean(value),
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

  const sourceMaterials = useMemo(() => {
    if (useLocalCatalog) {
      return filterRawMaterialsBySearch(catalog?.items ?? [], debouncedSearch);
    }

    return searchResult?.items ?? [];
  }, [catalog?.items, debouncedSearch, searchResult?.items, useLocalCatalog]);

  const pickerMaterials = useMemo(() => {
    let items = sourceMaterials.filter((material) => !effectiveExcludeIds.has(material.id));

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
  }, [effectiveExcludeIds, filterMaterial, selectedMaterial, sourceMaterials]);

  const catalogMaterialsById = useMemo(() => {
    const map = new Map<string, RawMaterialListItem>();

    for (const material of catalog?.items ?? []) {
      map.set(material.id, material);
    }

    if (selectedMaterial) {
      map.set(selectedMaterial.id, selectedMaterial);
    }

    for (const material of pickerMaterials) {
      map.set(material.id, material);
    }

    return map;
  }, [catalog?.items, pickerMaterials, selectedMaterial]);

  const options = useMemo(() => {
    if (!useLocalCatalog || debouncedSearch.trim()) {
      if (hideSelectedMaterials) {
        return pickerMaterials.map((material) => ({
          value: material.id,
          label: formatRawMaterialPickerLabel(material),
          keywords: `${material.code} ${material.name} ${material.category}`,
        }));
      }

      return buildRawMaterialComboboxOptions(pickerMaterials, disabledMaterialIds);
    }

    const sectionMaterials = [...catalogMaterialsById.values()].filter(
      (material) => !effectiveExcludeIds.has(material.id) && (!filterMaterial || filterMaterial(material)),
    );

    return buildSectionedOptions(
      sectionMaterials,
      disabledMaterialIds,
      hideSelectedMaterials,
      recentIds,
      frequentIds,
      searchQuery,
    );
  }, [
    catalogMaterialsById,
    debouncedSearch,
    disabledMaterialIds,
    effectiveExcludeIds,
    filterMaterial,
    frequentIds,
    hideSelectedMaterials,
    pickerMaterials,
    recentIds,
    searchQuery,
    useLocalCatalog,
  ]);

  const isSearching = searchQuery !== debouncedSearch;
  const isLoadingOptions = useLocalCatalog
    ? isCatalogLoading
    : isServerLoading || isServerFetching || isSearching;
  const isError = useLocalCatalog ? isCatalogError : isServerError;
  const error = useLocalCatalog ? catalogError : serverError;
  const isRefetching = useLocalCatalog ? isRefetchingCatalog : isRefetchingServer;

  const searchErrorMessage =
    isError && error ? toUserFriendlyLoadError(error.message) : undefined;

  function handleRetrySearch() {
    if (useLocalCatalog) {
      void refetchCatalog();
      return;
    }

    void refetchServer();
  }

  function handleValueChange(nextValue: string) {
    onValueChange(nextValue);
    onMaterialSelected?.(nextValue);
  }

  function handleInputFocus() {
    setRecentIds(getRecentRawMaterialIds());
    setFrequentIds(getFrequentRawMaterialIds());
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
        isLoadingOptions={isLoadingOptions}
        optionsErrorMessage={searchErrorMessage}
        onRetryOptions={searchErrorMessage ? handleRetrySearch : undefined}
        onValueChange={handleValueChange}
        onFocus={handleInputFocus}
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
