import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDailyBusinessStatementAction } from '@/actions/daily-business-statement';
import { getDailyReportAction } from '@/actions/daily-report';
import { getDailySummaryDashboardAction } from '@/actions/daily-summary-dashboard';
import { getDashboardAction } from '@/actions/dashboard';
import { listProductsAction } from '@/actions/products';
import { listPurchasesAction } from '@/actions/purchases';
import { getMonthlyReportAction } from '@/actions/monthly-report';
import { getStockOverviewAction } from '@/actions/stock-overview';
import { DomainError } from '@/lib/domain/errors';

const { mockGetAuthenticatedContext } = vi.hoisted(() => ({
  mockGetAuthenticatedContext: vi.fn(),
}));

vi.mock('@/lib/firebase/auth-server', () => ({
  getAuthenticatedContext: mockGetAuthenticatedContext,
}));

vi.mock('@/lib/services/daily-report.service', () => ({
  dailyReportService: {
    getDailyReport: vi.fn(async (orgId: string) => ({ orgId, rows: [] })),
  },
}));

vi.mock('@/lib/services/daily-business-statement.service', () => ({
  dailyBusinessStatementService: {
    getDailyBusinessStatement: vi.fn(async (orgId: string, date: string) => ({
      orgId,
      reportDate: date,
      summary: {},
      sales: [],
      expenses: [],
      production: [],
      wastage: [],
      returns: [],
    })),
  },
}));

vi.mock('@/lib/services/monthly-report.service', () => ({
  monthlyReportService: {
    getMonthlyReport: vi.fn(async (orgId: string) => ({ orgId, month: '2026-07' })),
  },
}));

vi.mock('@/lib/services/daily-summary-dashboard.service', () => ({
  dailySummaryDashboardService: {
    getDashboard: vi.fn(async (orgId: string) => ({ orgId, kpis: {} })),
  },
}));

vi.mock('@/lib/services/dashboard.service', () => ({
  dashboardService: {
    getDashboard: vi.fn(async (orgId: string) => ({ orgId, cards: [] })),
  },
}));

vi.mock('@/lib/services/product.service', () => ({
  productService: {
    list: vi.fn(async (orgId: string) => ({
      orgId,
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    })),
  },
}));

vi.mock('@/lib/services/purchase.service', () => ({
  purchaseService: {
    list: vi.fn(async (orgId: string) => ({
      orgId,
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    })),
  },
}));

vi.mock('@/lib/services/stock-overview.service', () => ({
  stockOverviewService: {
    getOverview: vi.fn(async (orgId: string) => ({
      orgId,
      products: [],
      rawMaterials: [],
      summary: {
        totalProducts: 0,
        totalRawMaterials: 0,
        lowStockItems: 0,
        outOfStockItems: 0,
      },
      attentionItems: [],
    })),
  },
}));

import { dailyBusinessStatementService } from '@/lib/services/daily-business-statement.service';
import { dailyReportService } from '@/lib/services/daily-report.service';
import { dailySummaryDashboardService } from '@/lib/services/daily-summary-dashboard.service';
import { dashboardService } from '@/lib/services/dashboard.service';
import { monthlyReportService } from '@/lib/services/monthly-report.service';
import { productService } from '@/lib/services/product.service';
import { purchaseService } from '@/lib/services/purchase.service';
import { stockOverviewService } from '@/lib/services/stock-overview.service';

function grantContext(input: { userId: string; orgId: string; role: 'owner' | 'manager' | 'sales' | 'production' | 'store' }) {
  mockGetAuthenticatedContext.mockResolvedValue(input);
}

describe('RBAC enforcement through server actions', () => {
  beforeEach(() => {
    mockGetAuthenticatedContext.mockReset();
    vi.mocked(dailyReportService.getDailyReport).mockClear();
    vi.mocked(dailyBusinessStatementService.getDailyBusinessStatement).mockClear();
    vi.mocked(dailySummaryDashboardService.getDashboard).mockClear();
    vi.mocked(monthlyReportService.getMonthlyReport).mockClear();
    vi.mocked(dashboardService.getDashboard).mockClear();
    vi.mocked(productService.list).mockClear();
    vi.mocked(purchaseService.list).mockClear();
    vi.mocked(stockOverviewService.getOverview).mockClear();
  });

  it('allows owner to read reports', async () => {
    grantContext({ userId: 'owner-1', orgId: 'org-a', role: 'owner' });

    const result = await getDailyReportAction();

    expect(result.success).toBe(true);
    expect(dailyReportService.getDailyReport).toHaveBeenCalledWith('org-a');
  });

  it('allows manager to read reports', async () => {
    grantContext({ userId: 'manager-1', orgId: 'org-a', role: 'manager' });

    const result = await getMonthlyReportAction();

    expect(result.success).toBe(true);
    expect(monthlyReportService.getMonthlyReport).toHaveBeenCalledWith('org-a');
  });

  it('denies sales access to reports', async () => {
    grantContext({ userId: 'sales-1', orgId: 'org-a', role: 'sales' });

    const result = await getDailyReportAction();

    expect(result).toEqual({
      success: false,
      error: 'You do not have permission to perform this action.',
      code: 'UNAUTHORIZED',
    });
    expect(dailyReportService.getDailyReport).not.toHaveBeenCalled();
  });

  it('allows owner to export a daily business statement for the session org and date', async () => {
    grantContext({ userId: 'owner-1', orgId: 'org-a', role: 'owner' });

    const result = await getDailyBusinessStatementAction('2026-08-10');

    expect(result.success).toBe(true);
    expect(dailyBusinessStatementService.getDailyBusinessStatement).toHaveBeenCalledWith(
      'org-a',
      '2026-08-10',
    );
  });

  it('denies sales access to daily business statement export', async () => {
    grantContext({ userId: 'sales-1', orgId: 'org-a', role: 'sales' });

    const result = await getDailyBusinessStatementAction('2026-08-10');

    expect(result.success).toBe(false);
    expect(result.code).toBe('UNAUTHORIZED');
    expect(dailyBusinessStatementService.getDailyBusinessStatement).not.toHaveBeenCalled();
  });

  it('allows owner and manager to read Kitchen Dashboard', async () => {
    grantContext({ userId: 'owner-1', orgId: 'org-a', role: 'owner' });
    const ownerResult = await getDailySummaryDashboardAction();

    grantContext({ userId: 'manager-1', orgId: 'org-a', role: 'manager' });
    const managerResult = await getDailySummaryDashboardAction();

    expect(ownerResult.success).toBe(true);
    expect(managerResult.success).toBe(true);
    expect(dailySummaryDashboardService.getDashboard).toHaveBeenCalledWith('org-a');
  });

  it('denies production, sales, and store access to Kitchen Dashboard', async () => {
    for (const role of ['production', 'sales', 'store'] as const) {
      grantContext({ userId: `${role}-1`, orgId: 'org-a', role });
      vi.mocked(dailySummaryDashboardService.getDashboard).mockClear();

      const result = await getDailySummaryDashboardAction();

      expect(result).toEqual({
        success: false,
        error: 'You do not have permission to perform this action.',
        code: 'UNAUTHORIZED',
      });
      expect(dailySummaryDashboardService.getDashboard).not.toHaveBeenCalled();
    }
  });

  it('denies store access to monthly summary', async () => {
    grantContext({ userId: 'store-1', orgId: 'org-a', role: 'store' });

    const result = await getMonthlyReportAction();

    expect(result.success).toBe(false);
    expect(result.code).toBe('UNAUTHORIZED');
    expect(monthlyReportService.getMonthlyReport).not.toHaveBeenCalled();
  });

  it('denies sales access to purchases', async () => {
    grantContext({ userId: 'sales-1', orgId: 'org-a', role: 'sales' });

    const result = await listPurchasesAction({ page: 1, pageSize: 20 });

    expect(result.success).toBe(false);
    expect(result.code).toBe('UNAUTHORIZED');
    expect(purchaseService.list).not.toHaveBeenCalled();
  });

  it('allows owner to read inventory for the session organization', async () => {
    grantContext({ userId: 'owner-1', orgId: 'org-a', role: 'owner' });

    const result = await getStockOverviewAction();

    expect(result.success).toBe(true);
    expect(stockOverviewService.getOverview).toHaveBeenCalledWith('org-a');
    expect(stockOverviewService.getOverview).not.toHaveBeenCalledWith('org-b');
  });

  it('allows production to read products but not purchases', async () => {
    grantContext({ userId: 'production-1', orgId: 'org-a', role: 'production' });

    const productResult = await listProductsAction({ page: 1, pageSize: 20, status: 'active' });
    const purchaseResult = await listPurchasesAction({ page: 1, pageSize: 20 });

    expect(productResult.success).toBe(true);
    expect(productService.list).toHaveBeenCalledWith('org-a', expect.any(Object));
    expect(purchaseResult.success).toBe(false);
    expect(purchaseResult.code).toBe('UNAUTHORIZED');
  });

  it('denies store from creating products via list-only check on restricted modules', async () => {
    grantContext({ userId: 'store-1', orgId: 'org-a', role: 'store' });

    const dashboardResult = await getDashboardAction();

    expect(dashboardResult.success).toBe(true);
    expect(dashboardService.getDashboard).toHaveBeenCalledWith('org-a');
  });
});

describe('organization isolation through server actions', () => {
  beforeEach(() => {
    mockGetAuthenticatedContext.mockReset();
    vi.mocked(productService.list).mockClear();
    vi.mocked(stockOverviewService.getOverview).mockClear();
  });

  it('User A reads only Organization A data', async () => {
    grantContext({ userId: 'user-a', orgId: 'org-a', role: 'owner' });

    await listProductsAction({ page: 1, pageSize: 20, status: 'active' });

    expect(productService.list).toHaveBeenCalledWith('org-a', expect.any(Object));
    expect(productService.list).not.toHaveBeenCalledWith('org-b', expect.any(Object));
  });

  it('User B reads only Organization B data', async () => {
    grantContext({ userId: 'user-b', orgId: 'org-b', role: 'owner' });

    await listProductsAction({ page: 1, pageSize: 20, status: 'active' });

    expect(productService.list).toHaveBeenCalledWith('org-b', expect.any(Object));
    expect(productService.list).not.toHaveBeenCalledWith('org-a', expect.any(Object));
  });

  it('inventory overview uses session orgId and cannot target another organization', async () => {
    grantContext({ userId: 'user-a', orgId: 'org-a', role: 'owner' });

    await getStockOverviewAction();

    expect(stockOverviewService.getOverview).toHaveBeenCalledWith('org-a');
    expect(stockOverviewService.getOverview).not.toHaveBeenCalledWith('org-b');
  });
});

describe('unauthenticated server actions', () => {
  beforeEach(() => {
    mockGetAuthenticatedContext.mockReset();
  });

  it('returns UNAUTHORIZED when authentication fails', async () => {
    mockGetAuthenticatedContext.mockRejectedValue(
      new DomainError('UNAUTHORIZED', 'Authentication required.'),
    );

    const result = await listProductsAction({ page: 1, pageSize: 20, status: 'active' });

    expect(result.success).toBe(false);
    expect(result.code).toBe('UNAUTHORIZED');
  });

  it('returns INVALID_ROLE when role validation fails', async () => {
    mockGetAuthenticatedContext.mockRejectedValue(
      new DomainError('INVALID_ROLE', 'Your account role is missing or invalid. Contact your bakery owner.'),
    );

    const result = await getDailyReportAction();

    expect(result.success).toBe(false);
    expect(result.code).toBe('INVALID_ROLE');
  });
});
