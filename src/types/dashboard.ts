export type DashboardSummary = {
  todayDate: string;
  todaySalesTotal: number;
  todayProductionUnits: number;
  todayExpensesTotal: number;
  todayWastageUnits: number;
};

export type DashboardQuickCounts = {
  totalProducts: number;
  totalRawMaterials: number;
  draftPurchases: number;
  draftProduction: number;
  draftSales: number;
  draftExpenses: number;
};

export type DashboardLowStockProduct = {
  id: string;
  code: string;
  name: string;
  currentStock: number;
  unit: string;
};

export type DashboardRecentActivityItem = {
  id: string;
  number: string;
  date: string;
  detail: string;
  href: string;
  createdAt: Date;
};

export type DashboardRecentActivity = {
  production: DashboardRecentActivityItem[];
  sales: DashboardRecentActivityItem[];
  wastage: DashboardRecentActivityItem[];
  returns: DashboardRecentActivityItem[];
  expenses: DashboardRecentActivityItem[];
};

export type DashboardData = {
  summary: DashboardSummary;
  quickCounts: DashboardQuickCounts;
  lowStockProducts: DashboardLowStockProduct[];
  recentActivity: DashboardRecentActivity;
};
