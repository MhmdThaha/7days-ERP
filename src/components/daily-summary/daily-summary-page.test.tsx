// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DailySummaryPage } from '@/components/daily-summary/daily-summary-page';
import { DomainError } from '@/lib/domain/errors';

const { mockUseDailySummaryDashboard } = vi.hoisted(() => ({
  mockUseDailySummaryDashboard: vi.fn(),
}));

vi.mock('@/hooks/queries/use-daily-summary-dashboard', () => ({
  useDailySummaryDashboard: mockUseDailySummaryDashboard,
}));

describe('DailySummaryPage unauthorized state', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows AccessDenied when the query fails with UNAUTHORIZED', () => {
    mockUseDailySummaryDashboard.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      error: new DomainError('UNAUTHORIZED', 'You do not have permission to perform this action.'),
      refetch: vi.fn(),
      isRefetching: false,
    });

    render(<DailySummaryPage />);

    expect(screen.getAllByText('Access denied').length).toBeGreaterThan(0);
    expect(
      screen.getByText('Kitchen Dashboard is available to owners and managers only.'),
    ).toBeTruthy();
    expect(screen.queryByText('Failed to load daily summary')).toBeNull();
  });

  it('does not treat a permission-like message without UNAUTHORIZED as AccessDenied', () => {
    mockUseDailySummaryDashboard.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      error: new Error('permission to view the daily summary'),
      refetch: vi.fn(),
      isRefetching: false,
    });

    render(<DailySummaryPage />);

    expect(screen.getByText('Failed to load daily summary')).toBeTruthy();
    expect(screen.queryByText('Access denied')).toBeNull();
  });
});
