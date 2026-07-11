# Feature Specification: Daily Summary

> **Module:** 09 — Daily Summary  
> **Version:** 1.0  
> **Last updated:** 2026-07-07  
> **Status:** Draft — pending owner approval  
> **Dependencies:** Production, Sales, Purchases, Expenses, Wastage (all transactional modules)  
> **Dependents:** Dashboard, Monthly Summary

**Related docs:** [BUSINESS.md](../BUSINESS.md) · [DATABASE.md](../DATABASE.md)

---

## 1. Purpose

Daily Summary is a **derived, read-only** aggregation that answers: *"How did the business perform today?"* It consolidates production, sales, purchases, expenses, and wastage into a single financial and operational snapshot for any calendar day.

Data is **materialized** in Firestore (`dailySummaries/{YYYY-MM-DD}`) and recomputed whenever underlying transactions change — not manually entered by users.

---

## 2. Business Goal

- Provide end-of-day performance visibility in one screen.
- Show revenue, costs, and profit without manual calculation.
- Highlight top-selling products and production vs sales gaps.
- Support optional day close to lock historical records.
- Enable managers to reconcile daily operations before closing.

**Success metric:** Summary figures match manual calculation from source transactions; recalculation completes within 2 seconds of any transaction mutation.

---

## 3. Users

| Role | Access Level | Primary Actions |
|---|---|---|
| Owner | Read + Day Close | View any date; close/reopen days |
| Manager | Read + Day Close | View any date; close days |
| Production Staff | Read only | View today and recent days |
| Sales Staff | Read only | View today |
| Store Staff | Read only | View today |

---

## 4. User Stories

- **US-DS-01:** As an owner, I want to see today's total sales, expenses, and profit on one page so that I know how the day went.
- **US-DS-02:** As a manager, I want to select any past date and view its summary so that I can review historical performance.
- **US-DS-03:** As an owner, I want to see top-selling products for the day so that I know what's popular.
- **US-DS-04:** As a manager, I want to see production vs sales gap per product so that I can identify over/under production.
- **US-DS-05:** As a manager, I want to close the business day so that no one accidentally edits today's records.
- **US-DS-06:** As an owner, I want to reopen a closed day so that I can fix a legitimate error.
- **US-DS-07:** As a manager, I want expense breakdown by category so that I understand daily overhead.

---

## 5. Inputs

### 5.1 View Parameters (User Selection)

| Input | Type | Default | Notes |
|---|---|---|---|
| `summaryDate` | date | Today | Date picker navigation |
| Day close action | button | — | Manager/Owner only |
| Day reopen action | button | — | Owner only |

### 5.2 Recalculation Triggers (System — Not User Input)

Daily summary recalculates when any of these change for the affected date:

- Purchase created/updated/deleted
- Production created/updated/deleted
- Sales created/updated/deleted
- Expense created/updated/deleted
- Wastage created/updated/deleted

---

## 6. Outputs

### 6.1 KPI Cards Row

| Metric | Source / Formula |
|---|---|
| Total Production (units) | Σ production line quantities |
| Total Sales (net revenue) | Σ sales netTotal |
| Total Purchases | Σ purchase totalAmount |
| Total Expenses | Σ expense amounts |
| Total Wastage Cost | Σ wastage estimatedCost |
| Total COGS | Σ sales line cogs |
| Gross Profit | netSales − COGS |
| Net Profit | grossProfit − expenses − wastage |
| Profit Margin % | (netProfit / netSales) × 100 if sales > 0 |

### 6.2 Expense Breakdown

- Pie chart or table: category → amount (from `expensesByCategory`).

### 6.3 Product Performance Table

| Column | Description |
|---|---|
| Product | Name |
| Produced | Qty produced |
| Sold | Qty sold |
| Gap | Produced − Sold |
| Revenue | Sales revenue for product |
| COGS | Product COGS |

Top 5–10 products by quantity and by revenue.

### 6.4 Transaction Counts

- Number of sales transactions, production entries, etc. (informational).

### 6.5 Day Status

- Open / Closed badge.
- If closed: closed at, closed by.

### 6.6 Drill-Down Links

Each KPI links to respective module filtered by `summaryDate`.

---

## 7. Business Rules

| # | Rule |
|---|---|
| BR-DS-01 | Daily Summary is computed — never manually edited (except close/reopen flags). |
| BR-DS-02 | Recalculation triggered on every transactional mutation affecting the date. |
| BR-DS-03 | Date boundaries use organization timezone. |
| BR-DS-04 | Soft-deleted transactions excluded from calculations. |
| BR-DS-05 | Gross Profit = Total Net Sales − Total COGS. |
| BR-DS-06 | Net Profit = Gross Profit − Total Expenses − Total Wastage Cost. |
| BR-DS-07 | Purchases appear in summary but do NOT subtract from profit directly. |
| BR-DS-08 | Profit margin = 0 or N/A when sales = 0. |
| BR-DS-09 | Day close sets `isClosed = true` on daily summary; blocks transaction mutations if org setting enabled. |
| BR-DS-10 | Only Owner can reopen closed day. |
| BR-DS-11 | Day close is optional — disabled by default in org settings. |
| BR-DS-12 | If no transactions exist for date, summary doc still exists with zeros. |
| BR-DS-13 | `version` field incremented on each recalculation (optimistic concurrency). |
| BR-DS-14 | Top products limited to top 5 by default (configurable display count). |

---

## 8. Validation Rules

### Day Close

| Validation | Error Message |
|---|---|
| User role = manager or owner | "Insufficient permissions" |
| Day not already closed | "Day is already closed" |
| Day close enabled in org settings | "Day close is not enabled" |

### Day Reopen

| Validation | Error Message |
|---|---|
| User role = owner | "Only owner can reopen" |
| Day is closed | "Day is not closed" |

### Date Selection

| Validation | Error Message |
|---|---|
| Valid date | "Invalid date" |
| Not future beyond policy | "Cannot view summary for future dates" |

---

## 9. Firestore Collections Used

| Collection | Operation | Purpose |
|---|---|---|
| `organizations/{orgId}/dailySummaries/{dateKey}` | Read/Write | Materialized summary |
| `organizations/{orgId}/production/` | Read | Aggregate production |
| `organizations/{orgId}/sales/` | Read | Aggregate sales |
| `organizations/{orgId}/purchases/` | Read | Aggregate purchases |
| `organizations/{orgId}/expenses/` | Read | Aggregate expenses |
| `organizations/{orgId}/wastage/` | Read | Aggregate wastage |
| `organizations/{orgId}/settings/config` | Read | Day close enabled flag |
| `organizations/{orgId}/` | Read | Org timezone |

**Write pattern:** Server-side recalculation service writes summary doc after transactional mutations.

---

## 10. UI Components

### Pages

| Route | Description |
|---|---|
| `/daily-summary` | Default today |
| `/daily-summary?date=YYYY-MM-DD` | Specific date |

### Module-Specific Components

| Component | Description |
|---|---|
| `DailySummaryPage` | Main layout with date nav |
| `DailySummaryKPIGrid` | KPI cards row |
| `DailySummaryProfitCard` | Highlighted net profit card |
| `ProductPerformanceTable` | Produced vs sold gap table |
| `ExpenseCategoryChart` | Pie chart by category |
| `DayCloseButton` | Close day with confirmation |
| `DayReopenButton` | Owner-only reopen |
| `DayStatusBadge` | Open / Closed indicator |
| `SummaryDateNavigator` | Prev/next day arrows + date picker |
| `SummaryDrillDownLink` | KPI → filtered module link |

### Shared Components

`MetricCard`, `MoneyDisplay`, `DatePicker`, `ConfirmDialog`, `EmptyState`, `LoadingSkeleton`

### shadcn/ui + Recharts

`Card`, `Badge`, `Button`, `Table`, `ChartContainer`, `PieChart` (expense breakdown)

---

## 11. Edge Cases

| # | Scenario | Expected Behavior |
|---|---|---|
| EC-DS-01 | No transactions on date | Show all zeros; "No activity recorded" message |
| EC-DS-02 | Sales but no production | Gap shows negative (sold more than produced) |
| EC-DS-03 | Production but no sales | Gap shows positive (overproduction) |
| EC-DS-04 | Transaction edited after day closed | Block edit at transaction module; not summary issue |
| EC-DS-05 | Recalculation race (two edits simultaneously) | Last write wins; version increment |
| EC-DS-06 | View summary while transaction saving | Brief stale data; refresh after invalidation |
| EC-DS-07 | Close day with zero sales | Allow close; profit may be negative (expenses only) |
| EC-DS-08 | Timezone midnight boundary | "Today" follows org TZ not user device |
| EC-DS-09 | Profit margin with negative profit | Show negative percentage correctly |
| EC-DS-10 | 365 days historical lookup | Single doc read — fast |

---

## 12. Acceptance Criteria

- [ ] Summary page loads for today by default.
- [ ] Date navigator changes displayed summary.
- [ ] All KPI values match independently verified calculations.
- [ ] Product performance table shows correct produced/sold/gap.
- [ ] Expense category breakdown sums to total expenses.
- [ ] Recalculation runs after purchase/production/sale/expense/wastage save.
- [ ] KPI cards link to filtered module views.
- [ ] Day close sets isClosed and blocks transactions (when enabled).
- [ ] Owner can reopen closed day.
- [ ] Page loads in < 1 second (single doc read).
- [ ] Role-based visibility for day close actions.

---

## 13. Future Enhancements

| Priority | Enhancement |
|---|---|
| P2 | Print/PDF daily summary report |
| P2 | Email daily summary to owner at midnight |
| P2 | Compare day vs same day last week/month |
| P2 | Daily sales target vs actual |
| P3 | AI-generated daily commentary ("Sales up 12% driven by...") |
| P3 | Shift-level breakdown (morning vs evening) |

---

*Daily Summary recalculation service must be thoroughly unit tested — it is the financial source of truth for the Dashboard.*
