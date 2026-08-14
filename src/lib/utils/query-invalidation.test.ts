import { describe, expect, it, vi } from 'vitest';

import {
  invalidateDailyReportQueries,
  invalidateDashboardQueries,
} from '@/lib/utils/query-invalidation';

describe('query invalidation mapping for today views', () => {
  it('invalidates home dashboard with the canonical dashboard key', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const queryClient = { invalidateQueries } as never;

    await invalidateDashboardQueries(queryClient);

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['dashboard'] });
  });

  it('invalidates both Today\'s Report and Kitchen Dashboard prefix keys', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const queryClient = { invalidateQueries } as never;

    await invalidateDailyReportQueries(queryClient);

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['daily-report'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['daily-summary-dashboard'] });
    expect(invalidateQueries).toHaveBeenCalledTimes(2);
  });
});
