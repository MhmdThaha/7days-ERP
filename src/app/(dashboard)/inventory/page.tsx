import { StockOverviewPage } from '@/components/inventory/stock-overview-page';
import { can } from '@/lib/domain/permissions';
import { getAuthenticatedContext } from '@/lib/firebase/auth-server';

export default async function Page() {
  const { role } = await getAuthenticatedContext();

  return <StockOverviewPage canAdjustStock={can(role, 'complete', 'inventory')} />;
}
