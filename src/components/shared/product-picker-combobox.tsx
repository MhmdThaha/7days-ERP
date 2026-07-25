'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { getProductAction, listProductsAction } from '@/actions/products';
import { ItemCombobox, type ItemComboboxProps } from '@/components/shared/item-combobox';
import { Button } from '@/components/ui/button';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  ITEM_PICKER_DEBOUNCE_MS,
  ITEM_PICKER_PAGE_SIZE,
} from '@/lib/domain/constants/item-picker';
import { buildProductComboboxOptions } from '@/lib/utils/item-combobox-options';
import { toProductListItem } from '@/lib/utils/catalog-list-item';
import { toUserFriendlyLoadError } from '@/lib/utils/user-friendly-error';
import type { ProductListItem, ProductStatusFilter } from '@/types/product';

type ProductPickerComboboxProps = Omit<
  ItemComboboxProps,
  'options' | 'filterOptions' | 'onQueryChange' | 'isLoadingOptions'
> & {
  disabledProductIds?: string[];
  excludeProductIds?: string[];
  filterProduct?: (product: ProductListItem) => boolean;
  status?: ProductStatusFilter;
};

export function ProductPickerCombobox({
  value,
  disabledProductIds = [],
  excludeProductIds = [],
  filterProduct,
  status = 'active',
  placeholder = 'Search product name or code…',
  emptyMessage = 'No products match your search.',
  loadingMessage = 'Searching products…',
  ...itemComboboxProps
}: ProductPickerComboboxProps) {
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
    queryKey: ['products', 'picker', status, debouncedSearch],
    queryFn: async () => {
      const result = await listProductsAction({
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

  const { data: selectedProduct } = useQuery({
    queryKey: ['product', value],
    enabled: Boolean(value),
    queryFn: async () => {
      const result = await getProductAction(value!);

      if (!result.success) {
        throw new Error(result.error);
      }

      return toProductListItem(result.data);
    },
    staleTime: 5 * 60 * 1000,
  });

  const pickerProducts = useMemo(() => {
    const excludeIds = new Set(excludeProductIds);
    let items = (searchResult?.items ?? []).filter((product) => !excludeIds.has(product.id));

    if (filterProduct) {
      items = items.filter(filterProduct);
    }

    if (
      selectedProduct &&
      !excludeIds.has(selectedProduct.id) &&
      (!filterProduct || filterProduct(selectedProduct)) &&
      !items.some((product) => product.id === selectedProduct.id)
    ) {
      items = [selectedProduct, ...items];
    }

    return items;
  }, [excludeProductIds, filterProduct, searchResult?.items, selectedProduct]);

  const options = useMemo(
    () => buildProductComboboxOptions(pickerProducts, disabledProductIds),
    [disabledProductIds, pickerProducts],
  );

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
