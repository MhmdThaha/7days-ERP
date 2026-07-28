'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { getProductAction, listProductsAction } from '@/actions/products';
import { ItemCombobox, type ItemComboboxProps } from '@/components/shared/item-combobox';
import { useAuth } from '@/hooks/use-auth';
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
  /** Stable useFieldArray field.id — debug/lifecycle tracing only (not used in queryKey). */
  rowFieldId?: string;
  disabledProductIds?: string[];
  excludeProductIds?: string[];
  filterProduct?: (product: ProductListItem) => boolean;
  status?: ProductStatusFilter;
  /** Called with full product metadata immediately when a picker option is chosen. */
  onProductResolved?: (product: ProductListItem) => void;
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
  onProductResolved,
  onValueChange,
  ...itemComboboxProps
}: ProductPickerComboboxProps) {
  const { user, isAuthenticated } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedFromHook = useDebouncedValue(searchQuery, ITEM_PICKER_DEBOUNCE_MS);
  const debouncedSearch = searchQuery === '' ? '' : debouncedFromHook;

  const {
    data: searchResult,
    isLoading,
    isFetching,
    isPending,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['products', 'picker', user?.uid, status, debouncedSearch],
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
    enabled: isAuthenticated,
    placeholderData: keepPreviousData,
  });

  const { data: selectedProduct } = useQuery({
    queryKey: ['product', user?.uid, value],
    enabled: isAuthenticated && Boolean(value),
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
    const serverItems = searchResult?.items ?? [];
    let items = serverItems.filter((product) => !excludeIds.has(product.id));

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

  function handleValueChange(productId: string) {
    const resolvedProduct =
      pickerProducts.find((product) => product.id === productId) ??
      (selectedProduct?.id === productId ? selectedProduct : null);

    if (resolvedProduct) {
      onProductResolved?.(resolvedProduct);
    }

    onValueChange(productId);
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
        isLoadingOptions={isPending || isFetching || isSearching}
        optionsErrorMessage={searchErrorMessage}
        onRetryOptions={searchErrorMessage ? handleRetrySearch : undefined}
        onValueChange={handleValueChange}
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
