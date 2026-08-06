'use client';

import { useCallback, useMemo, useState } from 'react';

import { StockOverviewActionCenter } from '@/components/inventory/stock-overview-action-center';
import { StockOverviewAttentionSection } from '@/components/inventory/stock-overview-attention-section';
import { StockOverviewProductsSection } from '@/components/inventory/stock-overview-products-section';
import { StockOverviewRawMaterialsSection } from '@/components/inventory/stock-overview-raw-materials-section';
import { StockOverviewSkeleton } from '@/components/inventory/stock-overview-skeleton';
import { StockOverviewSummarySection } from '@/components/inventory/stock-overview-summary-section';
import {
  filterAttentionItems,
  filterProducts,
  filterRawMaterials,
  matchesStockStatusFilter,
  sortByStockSeverity,
  type StockOverviewStatusFilter,
} from '@/components/inventory/stock-overview-table-utils';
import { StockOverviewToolbar } from '@/components/inventory/stock-overview-toolbar';
import { LoadErrorAlert } from '@/components/shared/load-error-alert';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useStockOverview } from '@/hooks/queries/use-stock-overview';

export function StockOverviewPage() {
  const { data, isLoading, isFetching, error, refetch, isRefetching } = useStockOverview();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StockOverviewStatusFilter>('all');

  const showSkeleton = isLoading || (isFetching && !data);

  const filteredProducts = useMemo(() => {
    if (!data) {
      return [];
    }

    return sortByStockSeverity(filterProducts(data.products, search, statusFilter));
  }, [data, search, statusFilter]);

  const filteredRawMaterials = useMemo(() => {
    if (!data) {
      return [];
    }

    return sortByStockSeverity(filterRawMaterials(data.rawMaterials, search, statusFilter));
  }, [data, search, statusFilter]);

  const filteredAttentionItems = useMemo(() => {
    if (!data) {
      return [];
    }

    return filterAttentionItems(data.attentionItems, search).filter((item) =>
      matchesStockStatusFilter(item.currentStock, item.status, statusFilter),
    );
  }, [data, search, statusFilter]);

  const hasActiveFilters = Boolean(search.trim()) || statusFilter !== 'all';

  function clearFilters() {
    setSearch('');
    setStatusFilter('all');
  }

  const scrollToAttention = useCallback(() => {
    document.getElementById('stock-overview-attention')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, []);

  const openBuyNow = useCallback(() => {
    setSearch('');
    setStatusFilter('out_of_stock');
    window.requestAnimationFrame(() => scrollToAttention());
  }, [scrollToAttention]);

  const openLowStock = useCallback(() => {
    setSearch('');
    setStatusFilter('low_stock');
    window.requestAnimationFrame(() => scrollToAttention());
  }, [scrollToAttention]);

  if (showSkeleton) {
    return <StockOverviewSkeleton />;
  }

  const isOrgError = error?.message.includes('Organization context is not configured');

  if (error || !data) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Inventory"
          description="See what needs attention and what's in stock."
        />
        {isOrgError ? (
          <Alert variant="destructive">
            <AlertTitle>Configuration required</AlertTitle>
            <AlertDescription>
              Set <code className="font-mono text-sm">DEV_ORG_ID</code> in your{' '}
              <code className="font-mono text-sm">.env.local</code> file to connect to Firestore.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            <LoadErrorAlert
              title="Failed to load stock overview"
              error={error}
              onRetry={() => void refetch()}
              isRetrying={isRefetching}
            />
            {!error ? (
              <Alert variant="destructive">
                <AlertTitle>Inventory unavailable</AlertTitle>
                <AlertDescription>Unable to load inventory data.</AlertDescription>
              </Alert>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-10">
      <PageHeader
        title="Inventory"
        description="See what needs attention and what's in stock."
      />

      <StockOverviewSummarySection summary={data.summary} />

      <StockOverviewActionCenter
        attentionItems={data.attentionItems}
        onOpenBuyNow={openBuyNow}
        onOpenLowStock={openLowStock}
      />

      <StockOverviewToolbar
        search={search}
        statusFilter={statusFilter}
        onSearchChange={setSearch}
        onStatusFilterChange={setStatusFilter}
      />

      <StockOverviewAttentionSection
        items={filteredAttentionItems}
        totalAttentionCount={data.attentionItems.length}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
      />

      <StockOverviewProductsSection
        products={filteredProducts}
        totalCount={data.products.length}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
      />

      <StockOverviewRawMaterialsSection
        rawMaterials={filteredRawMaterials}
        totalCount={data.rawMaterials.length}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
      />
    </div>
  );
}
