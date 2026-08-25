// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DashboardKpiSection } from '@/components/dashboard/dashboard-kpi-section';

describe('dashboard sales KPI label', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows gross sales label on the dashboard', () => {
    render(
      <DashboardKpiSection
        summary={{
          todayDate: '2026-08-23',
          todaySalesTotal: 16_000,
          todayProductionUnits: 12,
          todayExpensesTotal: 500,
          todayWastageUnits: 0,
        }}
        counts={{
          totalProducts: 0,
          totalRawMaterials: 0,
          draftPurchases: 0,
          draftProduction: 0,
          draftSales: 0,
          draftExpenses: 0,
        }}
      />,
    );

    expect(screen.getByText("Today's Gross Sales")).toBeTruthy();
    expect(screen.queryByText("Today's Sales")).toBeNull();
  });
});
