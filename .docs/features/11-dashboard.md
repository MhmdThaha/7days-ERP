# Feature Specification: Management Dashboard

> **Module:** 11 — Management Dashboard  
> **Version:** 1.0  
> **Last updated:** 2026-07-07  
> **Status:** Draft — pending owner approval  
> **Dependencies:** Daily Summary, Monthly Summary, Inventory (low stock), all transactional modules  
> **Dependents:** None (terminal module)

**Related docs:** [BUSINESS.md](../BUSINESS.md) · [DATABASE.md](../DATABASE.md) · [UI_GUIDELINES.md](../UI_GUIDELINES.md)

---

## 1. Purpose

The Management Dashboard is the **default landing page** and command center for bakery owners and managers. It provides an at-a-glance, **today-first** view of business performance with monthly context, low stock alerts, and quick actions — enabling immediate answers without navigating multiple modules.

---

## 2. Business Goal

- Answer the owner's top questions within 5 seconds of login.
- Provide one-click navigation to detailed modules.
- Highlight problems requiring attention (low stock, negative inventory, high wastage).
- Enable quick actions for common tasks (record sale, production, purchase).
- Load fast (< 2 seconds) despite aggregating multiple data sources.

**Success metric:** Dashboard LCP < 2.5s; all KPI values match Daily Summary for today; drill-down links land on correctly filtered pages.

---

## 3. Users

| Role | Access Level | Dashboard View |
|---|---|---|
| Owner | Full dashboard | All widgets |
| Manager | Full dashboard | All widgets |
| Production Staff | Limited dashboard | Production, inventory, wastage widgets |
| Sales Staff | Limited dashboard | Sales, best sellers widgets |
| Store Staff | Limited dashboard | Sales quick action, basic KPIs |

---

## 4. User Stories

- **US-DB-01:** As an owner, I want to see today's sales and profit immediately on login so that I know how business is going.
- **US-DB-02:** As a manager, I want low stock alerts visible on the dashboard so that I can reorder before running out.
- **US-DB-03:** As an owner, I want to compare today's sales to yesterday so that I see the trend direction.
- **US-DB-04:** As a manager, I want quick action buttons to record a sale or production so that I don't navigate through menus.
- **US-DB-05:** As an owner, I want a 30-day sales trend chart so that I see the bigger picture.
- **US-DB-06:** As an owner, I want to see month-to-date revenue so that I track monthly progress.
- **US-DB-07:** As production staff, I want to see today's production total so that I know what's been baked.
- **US-DB-08:** As an owner, I want to click any KPI to see details so that I can investigate further.

---

## 5. Inputs

### 5.1 Implicit Context (System)

| Input | Source |
|---|---|
| Today's date | Org timezone |
| Yesterday's date | Org timezone |
| Current month | Org timezone |
| User role | Auth session |
| Organization ID | Auth session |

### 5.2 User Interactions

| Input | Action |
|---|---|
| Click KPI card | Navigate to module with date filter |
| Click quick action | Navigate to create form |
| Click low stock item | Navigate to inventory item detail |
| Click chart data point | Navigate to daily summary for that date |
| Refresh (optional) | Manual query invalidation |

No form inputs on dashboard itself in v1.

---

## 6. Outputs

### 6.1 Today KPI Row

| Widget | Data | Comparison |
|---|---|---|
| Today's Sales | `dailySummaries[today].totalNetSales` | vs yesterday % change |
| Today's Production | `dailySummaries[today].totalProductionUnits` | vs yesterday units |
| Today's Expenses | `dailySummaries[today].totalExpenses` | top expense category |
| Today's Purchases | `dailySummaries[today].totalPurchases` | — |
| Today's Net Profit | `dailySummaries[today].netProfit` | vs yesterday |
| Wastage Today | cost + count | — |

### 6.2 Alert Widgets

| Widget | Data Source |
|---|---|
| Low Stock Alerts | `inventory/balances where isLowStock=true` limit 5 |
| Negative Stock | `inventory/balances where isNegative=true` count |

### 6.3 Performance Widgets

| Widget | Data Source |
|---|---|
| Best Sellers Today | `dailySummaries[today].topProductsByQuantity` top 5 |
| Production vs Sales Gap | From daily summary product performance; summary indicator |

### 6.4 Monthly Context Row

| Widget | Data Source |
|---|---|
| MTD Revenue | `monthlySummaries[currentMonth].totalRevenue` |
| MTD Net Profit | `monthlySummaries[currentMonth].netProfit` |
| Sales Trend (30 days) | Last 30 `dailySummaries` revenue points |
| Category Mix | Aggregate sales by product category for current month |

### 6.5 Quick Actions Bar

| Action | Target Route |
|---|---|
| + Record Sale | `/sales/new` |
| + Record Production | `/production/new` |
| + Record Purchase | `/purchases/new` |
| + Record Expense | `/expenses/new` |
| + Record Wastage | `/wastage/new` |

### 6.6 Header Context

- "Today: {formatted date}" in org timezone.
- Optional greeting with user name.

---

## 7. Business Rules

| # | Rule |
|---|---|
| BR-DB-01 | Dashboard is read-only — no data mutations on this page. |
| BR-DB-02 | Default route after login for all roles (role-filtered widgets). |
| BR-DB-03 | All "today" metrics from single `dailySummaries/{today}` doc read. |
| BR-DB-04 | Yesterday comparison: `((today - yesterday) / yesterday) × 100`; if yesterday = 0, show "N/A" or absolute change only. |
| BR-DB-05 | MTD from `monthlySummaries/{currentMonth}` doc. |
| BR-DB-06 | 30-day trend from last 30 daily summary docs (batch read or cached). |
| BR-DB-07 | Low stock from inventory balances query (limit 5). |
| BR-DB-08 | All KPI cards clickable — drill down to filtered module view. |
| BR-DB-09 | Quick actions visible based on role permissions. |
| BR-DB-10 | Production staff dashboard hides financial details (expenses, profit) if configured — default: show production + inventory only. |
| BR-DB-11 | Dashboard data refreshes on window focus (optional) or 5-minute stale time. |
| BR-DB-12 | Charts loaded via dynamic import (code splitting). |
| BR-DB-13 | If today's summary doc doesn't exist yet, show zeros (no error). |
| BR-DB-14 | Setup incomplete banner if org has no products or no transactions yet. |

---

## 8. Validation Rules

No user input validation — display-only module.

**Data integrity checks (development):**

| Check | Expected |
|---|---|
| Today sales KPI = daily summary net sales | Exact match |
| MTD revenue = monthly summary total | Exact match |
| Low stock count = inventory query count | Exact match |

---

## 9. Firestore Collections Used

| Collection | Operation | Purpose |
|---|---|---|
| `organizations/{orgId}/dailySummaries/{today}` | Read | Today KPIs |
| `organizations/{orgId}/dailySummaries/{yesterday}` | Read | Comparison |
| `organizations/{orgId}/dailySummaries/` | Read | 30-day trend (query last 30 dates) |
| `organizations/{orgId}/monthlySummaries/{currentMonth}` | Read | MTD metrics |
| `organizations/{orgId}/inventory/balances/` | Read | Low stock, negative stock |
| `organizations/{orgId}/products/` | Read | Category mix (count by category from sales — or from daily data) |
| `organizations/{orgId}/sales/` | Read (optional) | Category mix if not in summary |
| `organizations/{orgId}/` | Read | Org timezone |
| `organizations/{orgId}/members/{userId}` | Read | Role for widget filtering |

**Query optimization:**

- Parallel fetch: today summary + yesterday summary + monthly summary + low stock in `Promise.all`.
- 30-day trend: single query `where summaryDate >= startDate orderBy summaryDate asc` limit 30.

---

## 10. UI Components

### Pages

| Route | Description |
|---|---|
| `/` or `/dashboard` | Main dashboard (default authenticated landing) |

### Module-Specific Components

| Component | Description |
|---|---|
| `DashboardPage` | Grid layout orchestrator |
| `DashboardKPIGrid` | Today KPI cards row |
| `DashboardComparisonMetric` | KPI with vs-yesterday badge |
| `LowStockWidget` | Compact list with item name, qty, reorder level |
| `NegativeStockAlert` | Banner if any negative stock exists |
| `BestSellersWidget` | Top 5 products today |
| `ProductionSalesGapWidget` | Summary over/under indicator |
| `SalesTrendChart` | 30-day line chart |
| `CategoryMixChart` | Pie chart — sales by category |
| `MTDWidget` | Month-to-date revenue and profit |
| `QuickActionsBar` | Action buttons row |
| `SetupIncompleteBanner` | Onboarding reminder |
| `RoleFilteredDashboard` | Widget visibility by role |

### Shared Components

`MetricCard`, `MoneyDisplay`, `StatusBadge`, `LoadingSkeleton`, `EmptyState`

### shadcn/ui + Recharts

`Card`, `ChartContainer`, `LineChart`, `PieChart`, `Button`, `Badge`, `Alert`, `Skeleton`

**Layout (from UI_GUIDELINES):**

```
┌──────────┬──────────┬──────────┬──────────┐
│  Sales   │ Production│ Expenses │  Profit  │
├──────────┴──────────┴──────────┴──────────┤
│  Sales Trend (30 days)        │ Low Stock  │
├───────────────────────────────┼────────────┤
│  Best Sellers Today           │ Wastage    │
├───────────────────────────────┴────────────┤
│  Quick Actions                            │
└────────────────────────────────────────────┘
```

---

## 11. Edge Cases

| # | Scenario | Expected Behavior |
|---|---|---|
| EC-DB-01 | First day of operation (no yesterday) | Comparison shows "—" or "First day" |
| EC-DB-02 | Yesterday sales = 0, today > 0 | Show "+100%" or absolute only — avoid divide by zero |
| EC-DB-03 | No products configured | Setup banner; empty widgets gracefully |
| EC-DB-04 | No low stock items | Low stock widget shows "All stock levels OK" |
| EC-DB-05 | 30-day trend spans month boundary | Query handles cross-month dates |
| EC-DB-06 | Slow network | Skeleton loading for each widget independently |
| EC-DB-07 | Production staff login | Hide expense/profit widgets per role config |
| EC-DB-08 | Midnight rollover while on dashboard | Stale until refresh — acceptable v1 |
| EC-DB-09 | Large org name in header | Truncate with tooltip |
| EC-DB-10 | All KPIs zero on new org | Onboarding CTA prominent |

---

## 12. Acceptance Criteria

### Functional

- [ ] Dashboard is default page after login.
- [ ] Today KPIs match Daily Summary for today.
- [ ] Yesterday comparison calculates correctly (including zero edge cases).
- [ ] MTD widgets match Monthly Summary.
- [ ] Low stock widget shows up to 5 items with correct data.
- [ ] Best sellers match daily summary top products.
- [ ] 30-day sales trend chart renders with correct data points.
- [ ] Category mix chart shows sales by product category.
- [ ] All KPI cards navigate to correct filtered module page.
- [ ] Quick actions navigate to correct create forms.
- [ ] Quick actions hidden for roles without permission.
- [ ] Role-based widget filtering works for production/sales staff.

### Performance

- [ ] Dashboard loads in < 2 seconds with 1 year of historical data.
- [ ] Charts dynamically imported (not in initial bundle).
- [ ] Parallel data fetching implemented.

### UX

- [ ] Skeleton loading states for all widgets.
- [ ] Setup incomplete banner for new organizations.
- [ ] Responsive layout works on tablet.

---

## 13. Future Enhancements

| Priority | Enhancement |
|---|---|
| P2 | Customizable widget layout (drag and drop) |
| P2 | Revenue/profit target progress bars |
| P2 | Weather correlation notes (Phase 3 gimmick — low priority) |
| P2 | Real-time updates via Firestore listeners |
| P3 | Multiple dashboard presets by role |
| P3 | TV/display mode for production floor |
| P3 | Push notifications for low stock |
| P3 | AI insights card ("Consider increasing production of X") |

---

## 14. Role Widget Matrix

| Widget | Owner | Manager | Production | Sales | Store |
|---|---|---|---|---|---|
| Today's Sales | ✅ | ✅ | ❌ | ✅ | ✅ |
| Today's Production | ✅ | ✅ | ✅ | ❌ | ❌ |
| Today's Expenses | ✅ | ✅ | ❌ | ❌ | ❌ |
| Today's Purchases | ✅ | ✅ | ❌ | ❌ | ❌ |
| Today's Net Profit | ✅ | ✅ | ❌ | ❌ | ❌ |
| Wastage Today | ✅ | ✅ | ✅ | ❌ | ✅ |
| Low Stock | ✅ | ✅ | ✅ | ❌ | ❌ |
| Best Sellers | ✅ | ✅ | ❌ | ✅ | ✅ |
| MTD Revenue/Profit | ✅ | ✅ | ❌ | ❌ | ❌ |
| Sales Trend Chart | ✅ | ✅ | ❌ | ✅ | ❌ |
| Category Mix | ✅ | ✅ | ❌ | ❌ | ❌ |
| Quick: Sale | ✅ | ✅ | ❌ | ✅ | ✅ |
| Quick: Production | ✅ | ✅ | ✅ | ❌ | ❌ |
| Quick: Purchase | ✅ | ✅ | ❌ | ❌ | ❌ |
| Quick: Expense | ✅ | ✅ | ❌ | ❌ | ❌ |
| Quick: Wastage | ✅ | ✅ | ✅ | ❌ | ✅ |

---

*Dashboard is the last module to implement. It validates that all upstream modules and summary services work correctly together.*
