import type { QueryClient } from '@tanstack/react-query';

export async function invalidateDashboardQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
}

/**
 * Today's Report (`['daily-report', uid]`) and Kitchen Dashboard
 * (`['daily-summary-dashboard', 'v1', uid]`).
 * Prefix invalidation matches both canonical keys.
 */
export async function invalidateDailyReportQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['daily-report'] }),
    queryClient.invalidateQueries({ queryKey: ['daily-summary-dashboard'] }),
  ]);
}

export async function invalidateMonthlyReportQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ['monthly-report'] });
}
