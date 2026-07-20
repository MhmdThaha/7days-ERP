import type { QueryClient } from '@tanstack/react-query';

export async function invalidateDashboardQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
}

export async function invalidateDailyReportQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ['daily-report'] });
}

export async function invalidateMonthlyReportQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ['monthly-report'] });
}
