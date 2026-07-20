export const DAILY_SUMMARY_DASHBOARD_FETCH_PAGE_SIZE = 10_000;

export const DAILY_SUMMARY_DASHBOARD_LOW_STOCK_LIMIT = 10;

/** Wastage cost above this share of net sales triggers a high-wastage alert. */
export const DAILY_SUMMARY_HIGH_WASTAGE_SALES_RATIO = 0.05;

export const DAILY_SUMMARY_ACTIVITY_MODULE_LABELS = {
  purchase: 'Purchase',
  production: 'Production',
  sale: 'Sale',
  expense: 'Expense',
  wastage: 'Wastage',
} as const;
