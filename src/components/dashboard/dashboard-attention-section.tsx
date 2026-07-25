import { DashboardLowStockSection } from '@/components/dashboard/dashboard-low-stock-section';
import { DashboardQuickCountsSection } from '@/components/dashboard/dashboard-quick-counts';
import { SectionHeader } from '@/components/shared/section-header';
import type { DashboardLowStockProduct, DashboardQuickCounts } from '@/types/dashboard';

type DashboardAttentionSectionProps = {
  lowStockProducts: DashboardLowStockProduct[];
  counts: DashboardQuickCounts;
};

export function DashboardAttentionSection({
  lowStockProducts,
  counts,
}: DashboardAttentionSectionProps) {
  const hasLowStock = lowStockProducts.length > 0;
  const pendingDraftTotal =
    counts.draftPurchases +
    counts.draftProduction +
    counts.draftSales +
    counts.draftExpenses;

  return (
    <section aria-labelledby="dashboard-attention-heading" className="section-stack">
      <SectionHeader
        title="What needs attention?"
        description={
          hasLowStock || pendingDraftTotal > 0
            ? 'Review low stock and unfinished drafts below.'
            : 'Everything looks good. No urgent items right now.'
        }
        headingId="dashboard-attention-heading"
      />

      <div className="space-y-6">
        <DashboardLowStockSection products={lowStockProducts} />
        <DashboardQuickCountsSection counts={counts} />
      </div>
    </section>
  );
}
