'use client';

import { StockOverviewAttentionSection } from '@/components/inventory/stock-overview-attention-section';
import { StockOverviewProductsSection } from '@/components/inventory/stock-overview-products-section';
import { StockOverviewRawMaterialsSection } from '@/components/inventory/stock-overview-raw-materials-section';
import { StockOverviewSkeleton } from '@/components/inventory/stock-overview-skeleton';
import { StockOverviewSummarySection } from '@/components/inventory/stock-overview-summary-section';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useStockOverview } from '@/hooks/queries/use-stock-overview';

export function StockOverviewPage() {
  const { data, isLoading, isFetching, error } = useStockOverview();
  const showSkeleton = isLoading || (isFetching && !data);

  if (showSkeleton) {
    return <StockOverviewSkeleton />;
  }

  const isOrgError = error?.message.includes('Organization context is not configured');

  if (error || !data) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Inventory"
          description="See what stock you have right now."
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
          <Alert variant="destructive">
            <AlertTitle>Failed to load stock overview</AlertTitle>
            <AlertDescription>
              {error?.message ?? 'Unable to load inventory data.'}
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-10">
      <PageHeader
        title="Inventory"
        description="What stock do you have right now?"
      />

      <StockOverviewSummarySection summary={data.summary} />

      <StockOverviewProductsSection products={data.products} />

      <StockOverviewRawMaterialsSection rawMaterials={data.rawMaterials} />

      <StockOverviewAttentionSection items={data.attentionItems} />
    </div>
  );
}
