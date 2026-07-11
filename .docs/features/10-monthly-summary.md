# Feature Specification: Monthly Summary

> **Module:** 10 — Monthly Summary  
> **Version:** 1.0  
> **Last updated:** 2026-07-07  
> **Status:** Draft — pending owner approval  
> **Dependencies:** Daily Summary (materialized daily docs)  
> **Dependents:** Dashboard (MTD widgets)

**Related docs:** [BUSINESS.md](../BUSINESS.md) · [DATABASE.md](../DATABASE.md)

---

## 1. Purpose

Monthly Summary aggregates **daily summaries** into a calendar month view for owner-level performance review. It answers: *"How is the business performing this month?"* with trends, bestsellers, wastage analysis, and comparative metrics.

Like Daily Summary, this is **derived and read-only** — materialized in `monthlySummaries/{YYYY-MM}`.

---

## 2. Business Goal

- Enable owners to review monthly revenue, costs, and profit at a glance.
- Show daily trends within the month for pattern recognition.
- Identify best-selling products and highest wastage items.
- Support business decisions: pricing, purchasing, production planning.
- Calculate averages (daily sales, daily profit) for benchmarking.

**Success metric:** Monthly totals equal sum of daily summaries for the month; page loads in < 2 seconds.

---

## 3. Users

| Role | Access Level | Primary Actions |
|---|---|---|
| Owner | Read | View any month; primary audience |
| Manager | Read | View any month |
| Production Staff | No access | — |
| Sales Staff | No access | — |
| Store Staff | No access | — |

---

## 4. User Stories

- **US-MS-01:** As an owner, I want to see total revenue and net profit for the month so that I know if the business is profitable.
- **US-MS-02:** As an owner, I want a daily sales trend chart so that I can see which days were strong or weak.
- **US-MS-03:** As an owner, I want to see best-selling products for the month so that I can plan production and purchasing.
- **US-MS-04:** As an owner, I want to see highest wastage items so that I can reduce losses.
- **US-MS-05:** As an owner, I want average daily sales so that I can set targets.
- **US-MS-06:** As a manager, I want to compare expense categories for the month so that I can control costs.
- **US-MS-07:** As an owner, I want to navigate to previous months so that I can review history.

---

## 5. Inputs

### 5.1 View Parameters

| Input | Type | Default | Notes |
|---|---|---|---|
| `month` | month/year | Current month | Month picker |
| `year` | number | Current year | — |

### 5.2 Recalculation Triggers (System)

Monthly summary recalculates when:

- Any daily summary within the month is updated.
- Scheduled: end-of-day job optional Phase 2 (v1: on-demand after daily recalc).

---

## 6. Outputs

### 6.1 Monthly KPI Cards

| Metric | Formula |
|---|---|
| Total Revenue | Σ daily netSales |
| Total Purchases | Σ daily totalPurchases |
| Total Expenses | Σ daily totalExpenses |
| Total Wastage | Σ daily totalWastageCost |
| Total COGS | Σ daily totalCogs |
| Gross Profit | revenue − COGS |
| Net Profit | grossProfit − expenses − wastage |
| Operating Days | Count of days with any transaction activity |
| Average Daily Sales | revenue / operatingDays |
| Average Daily Profit | netProfit / operatingDays |

### 6.2 Daily Trend Chart

- Line chart: X = day of month (1–31), Y = revenue and/or net profit.
- Data from `dailyTrend[]` array.

### 6.3 Best Sellers

- Top 10 products by revenue.
- Top 10 products by quantity sold.

### 6.4 Wastage Analysis

- Top 5 items by wastage cost.
- Total wastage as % of revenue (computed display).

### 6.5 Expense Summary

- Total by category (aggregated from daily `expensesByCategory`).

### 6.6 Purchase vs Production Indicator

- Ratio or comparison: total purchases vs total production cost — informational metric for buying efficiency.

### 6.7 Drill-Down

- Click any day on trend chart → navigate to Daily Summary for that date.

---

## 7. Business Rules

| # | Rule |
|---|---|
| BR-MS-01 | Monthly Summary derived from daily summaries — not from raw transactions directly (performance). |
| BR-MS-02 | Month boundaries: calendar month in org timezone. |
| BR-MS-03 | Partial month (current month): includes data up to today only. |
| BR-MS-04 | Operating days = days where netSales > 0 OR totalProductionUnits > 0 OR totalExpenses > 0. |
| BR-MS-05 | Average daily metrics divide by operating days, not calendar days. |
| BR-MS-06 | Read-only — no user edits. |
| BR-MS-07 | Recalculated when any daily summary in month changes. |
| BR-MS-08 | Best sellers aggregated from daily top product data or re-queried from sales — implementation choice: aggregate from sales for accuracy. |
| BR-MS-09 | Historical months immutable once month ends (recompute still allowed if daily data corrected). |
| BR-MS-10 | Fiscal year setting in org stored but v1 monthly view uses calendar month. |

---

## 8. Validation Rules

| Input | Validation | Error Message |
|---|---|---|
| Month/year | Valid; not future month | "Cannot view future months" |
| Month/year | Not before org creation | "No data for this period" |

---

## 9. Firestore Collections Used

| Collection | Operation | Purpose |
|---|---|---|
| `organizations/{orgId}/monthlySummaries/{monthKey}` | Read/Write | Materialized monthly doc |
| `organizations/{orgId}/dailySummaries/` | Read | Aggregate daily data |
| `organizations/{orgId}/sales/` | Read (optional) | Best seller aggregation if needed |
| `organizations/{orgId}/wastage/` | Read (optional) | Wastage ranking if needed |
| `organizations/{orgId}/` | Read | Timezone, org creation date |

**Recalculation strategy:**

```
Option A (preferred): Sum dailySummaries for month → write monthlySummaries
Option B: Query all sales/wastage for month — accurate but slower; use for best seller detail
```

Hybrid: KPIs from daily summaries; best sellers from monthly aggregation query at recalc time.

---

## 10. UI Components

### Pages

| Route | Description |
|---|---|
| `/monthly-summary` | Current month default |
| `/monthly-summary?month=YYYY-MM` | Specific month |

### Module-Specific Components

| Component | Description |
|---|---|
| `MonthlySummaryPage` | Main layout |
| `MonthYearPicker` | Select month and year |
| `MonthlyKPIGrid` | KPI cards |
| `DailyTrendChart` | Revenue/profit line chart (Recharts) |
| `BestSellersTable` | Top products by revenue and qty |
| `WastageRankingTable` | Top wastage items |
| `ExpenseCategorySummary` | Monthly expense breakdown |
| `PurchaseProductionIndicator` | Comparison metric card |
| `MonthNavigator` | Prev/next month arrows |

### Shared Components

`MetricCard`, `MoneyDisplay`, `LoadingSkeleton`, `EmptyState`

### shadcn/ui + Recharts

`ChartContainer`, `LineChart`, `BarChart`, `Card`, `Table`, `Select`

---

## 11. Edge Cases

| # | Scenario | Expected Behavior |
|---|---|---|
| EC-MS-01 | Current month, mid-month | Show partial data; label "Month to date" |
| EC-MS-02 | Month with zero activity | All zeros; helpful empty state |
| EC-MS-03 | Org created mid-month | Only days with data shown in trend |
| EC-MS-04 | February (28/29 days) | Chart adapts to month length |
| EC-MS-05 | Daily summary corrected for past month | Monthly recalculates on next trigger |
| EC-MS-06 | Leap year | No special handling needed |
| EC-MS-07 | Operating days = 0 | Averages show N/A not divide by zero |
| EC-MS-08 | Large month (high transaction volume) | Monthly doc read still fast (pre-aggregated) |

---

## 12. Acceptance Criteria

- [ ] Monthly KPIs match sum of daily summaries for selected month.
- [ ] Month picker navigates correctly across years.
- [ ] Daily trend chart displays revenue per day.
- [ ] Best sellers table shows correct top products.
- [ ] Wastage ranking shows top items by cost.
- [ ] Average daily sales/profit calculated correctly.
- [ ] Click day on chart navigates to daily summary.
- [ ] Current month labeled as MTD.
- [ ] Page loads in < 2 seconds.
- [ ] Owner and Manager access only.

---

## 13. Future Enhancements

| Priority | Enhancement |
|---|---|
| P1 | Export PDF/Excel monthly report |
| P2 | Month-over-month comparison (% change) |
| P2 | Year-over-year comparison |
| P2 | Fiscal year view (Apr–Mar) |
| P2 | Revenue target vs actual progress bar |
| P3 | Product category performance breakdown |
| P3 | Cash flow summary (paid vs credit purchases) |
| P3 | Scheduled monthly email report to owner |

---

*Monthly Summary is owner-focused. Keep the UI clean and report-like — no editing affordances.*
