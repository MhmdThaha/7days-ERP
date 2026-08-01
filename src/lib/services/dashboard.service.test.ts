import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetTimezone, mockGetStaticData, mockGetTodaySummary } = vi.hoisted(() => ({
  mockGetTimezone: vi.fn(),
  mockGetStaticData: vi.fn(),
  mockGetTodaySummary: vi.fn(),
}));

vi.mock('@/lib/repositories/organization.repository', () => ({
  organizationRepository: {
    getTimezone: mockGetTimezone,
  },
}));

vi.mock('@/lib/repositories/dashboard.repository', () => ({
  dashboardRepository: {
    getStaticData: mockGetStaticData,
    getTodaySummary: mockGetTodaySummary,
  },
}));

vi.mock('@/lib/utils/date', () => ({
  getDateStringInTimezone: vi.fn(() => '2026-07-31'),
}));

import { dashboardService } from '@/lib/services/dashboard.service';

describe('dashboardService.getDashboard', () => {
  beforeEach(() => {
    mockGetTimezone.mockReset();
    mockGetStaticData.mockReset();
    mockGetTodaySummary.mockReset();

    mockGetTimezone.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve('Asia/Kolkata'), 10)),
    );
    mockGetStaticData.mockResolvedValue({
      quickCounts: {
        totalProducts: 1,
        totalRawMaterials: 2,
        draftPurchases: 0,
        draftProduction: 0,
        draftSales: 0,
        draftExpenses: 0,
      },
      lowStockProducts: [],
      recentActivity: {
        production: [],
        sales: [],
        wastage: [],
        returns: [],
        expenses: [],
      },
    });
    mockGetTodaySummary.mockResolvedValue({
      todayDate: '2026-07-31',
      todaySalesTotal: 100,
      todayProductionUnits: 5,
      todayExpensesTotal: 20,
      todayWastageUnits: 1,
    });
  });

  it('loads timezone and static dashboard data in parallel before today summary', async () => {
    const startedAt: string[] = [];

    mockGetTimezone.mockImplementation(async () => {
      startedAt.push('timezone');
      await new Promise((resolve) => setTimeout(resolve, 15));
      return 'Asia/Kolkata';
    });

    mockGetStaticData.mockImplementation(async () => {
      startedAt.push('static');
      await new Promise((resolve) => setTimeout(resolve, 15));
      return {
        quickCounts: {
          totalProducts: 1,
          totalRawMaterials: 2,
          draftPurchases: 0,
          draftProduction: 0,
          draftSales: 0,
          draftExpenses: 0,
        },
        lowStockProducts: [],
        recentActivity: {
          production: [],
          sales: [],
          wastage: [],
          returns: [],
          expenses: [],
        },
      };
    });

    mockGetTodaySummary.mockImplementation(async () => {
      startedAt.push('today');
      return {
        todayDate: '2026-07-31',
        todaySalesTotal: 100,
        todayProductionUnits: 5,
        todayExpensesTotal: 20,
        todayWastageUnits: 1,
      };
    });

    const data = await dashboardService.getDashboard('org-1');

    expect(startedAt.slice(0, 2)).toEqual(expect.arrayContaining(['timezone', 'static']));
    expect(startedAt.at(-1)).toBe('today');
    expect(mockGetTodaySummary).toHaveBeenCalledWith('org-1', '2026-07-31');
    expect(data.summary.todaySalesTotal).toBe(100);
    expect(data.quickCounts.totalProducts).toBe(1);
  });
});
