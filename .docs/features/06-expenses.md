# Feature Specification: Expenses

> **Module:** 06 — Expenses  
> **Version:** 1.0  
> **Last updated:** 2026-07-07  
> **Status:** Draft — pending owner approval  
> **Dependencies:** Phase 0 Foundation (Org Settings for categories)  
> **Dependents:** Daily Summary, Monthly Summary, Dashboard

**Related docs:** [BUSINESS.md](../BUSINESS.md) · [DATABASE.md](../DATABASE.md)

---

## 1. Purpose

Expenses tracks **operational costs** that are not captured through raw material purchases — rent, utilities, salaries, transport, marketing, and other overheads. Expenses reduce net profit in daily and monthly summaries but do **not** affect inventory.

---

## 2. Business Goal

- Record all non-inventory business spending in one place.
- Categorize expenses for cost analysis and reporting.
- Attach receipts for accounting and audit purposes.
- Provide accurate net profit calculation alongside sales and COGS.

**Success metric:** All overhead costs recordable in < 1 minute; expense totals in Daily Summary match sum of expense documents.

---

## 3. Users

| Role | Access Level | Primary Actions |
|---|---|---|
| Owner | Full CRUD | All dates |
| Manager | Full CRUD | All dates |
| Production Staff | No access | — |
| Sales Staff | No access | — |
| Store Staff | No access | — |

---

## 4. User Stories

- **US-EX-01:** As a manager, I want to record a daily expense with category and amount so that net profit reflects all costs.
- **US-EX-02:** As an owner, I want to categorize expenses so that I can see where money is going each month.
- **US-EX-03:** As a manager, I want to upload a receipt photo so that I have proof for accounting.
- **US-EX-04:** As an owner, I want to filter expenses by date range and category so that I can review spending patterns.
- **US-EX-05:** As a manager, I want to edit an expense entered with wrong amount so that records are corrected.
- **US-EX-06:** As an owner, I want expenses on closed days to be read-only so that historical data is protected.

---

## 5. Inputs

### 5.1 Expense Record

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `expenseDate` | date | Yes | Today | YYYY-MM-DD |
| `category` | string | Yes | — | From org settings |
| `amount` | money | Yes | — | > 0; minor units |
| `description` | string | Yes | — | Max 500 chars |
| `paymentMethod` | string | No | null | From org settings |
| `receipt` | file | No | null | PDF/JPEG/PNG; max 5 MB |

### 5.2 List Filters

Date range (default: this month), category, search (description).

---

## 6. Outputs

### 6.1 Expense List

- Table: date, category, description, amount, payment method, has receipt, created by.
- Category subtotals in footer or summary bar for filtered range.

### 6.2 Expense Detail

- Full record with receipt preview/download link.

### 6.3 Side Effects

- Recalculate `dailySummaries/{expenseDate}` — updates `totalExpenses` and `expensesByCategory`.
- **No inventory impact.**

---

## 7. Business Rules

| # | Rule |
|---|---|
| BR-EX-01 | Expenses do not affect inventory balances or movements. |
| BR-EX-02 | Expenses reduce net profit: `netProfit = grossProfit − expenses − wastage`. |
| BR-EX-03 | Purchases are NOT expenses — they flow through COGS. |
| BR-EX-04 | One expense document per cost event (not line-item based in v1). |
| BR-EX-05 | Edit/delete allowed on open days; blocked on closed days. |
| BR-EX-06 | Soft delete with audit trail. |
| BR-EX-07 | Receipt stored in Firebase Storage; URL on document. |
| BR-EX-08 | Recurring expenses entered manually in v1 (no automation). |
| BR-EX-09 | Salaries entered as lump sum expense (no payroll module v1). |
| BR-EX-10 | Only Owner and Manager roles can access this module. |

---

## 8. Validation Rules

| Field | Validation | Error Message |
|---|---|---|
| `expenseDate` | Required; valid; within date policy | "Invalid expense date" |
| `expenseDate` | Not closed day | "This day is closed" |
| `category` | Valid org expense category | "Select a category" |
| `amount` | Required; integer > 0 | "Amount must be greater than zero" |
| `description` | Required; 1–500 chars | "Description is required" |
| `paymentMethod` | Valid if provided | "Invalid payment method" |
| `receipt` | Max 5 MB; PDF/JPEG/PNG/WebP | "Invalid file" |

---

## 9. Firestore Collections Used

| Collection | Operation | Purpose |
|---|---|---|
| `organizations/{orgId}/expenses/{expenseId}` | CRUD | Expense records |
| `organizations/{orgId}/dailySummaries/{date}` | Write | Recalculate totals |
| `organizations/{orgId}/settings/config` | Read | Categories, payment methods |
| Firebase Storage `organizations/{orgId}/expenses/{expenseId}/` | Write | Receipt files |

**Indexes:**

- `(organizationId, expenseDate DESC)`
- `(organizationId, expenseDate, category)`

---

## 10. UI Components

### Pages

| Route | Description |
|---|---|
| `/expenses` | Expense list |
| `/expenses/new` | Create expense |
| `/expenses/[id]` | View/edit expense |

### Module-Specific Components

| Component | Description |
|---|---|
| `ExpenseForm` | Simple single-entry form |
| `ExpenseFilters` | Date range, category |
| `ReceiptUpload` | Drag-and-drop receipt upload |
| `ReceiptPreview` | Image/PDF preview on detail |
| `ExpenseCategorySummary` | Breakdown by category for filtered period |

### Shared Components

`PageHeader`, `DatePicker`, `DateRangeFilter`, `MoneyInput`, `MoneyDisplay`, `ConfirmDialog`, `EmptyState`

### shadcn/ui Primitives

`Button`, `Form`, `Card`, `Select`, `Textarea`, `Input`, `Badge` (category)

---

## 11. Edge Cases

| # | Scenario | Expected Behavior |
|---|---|---|
| EC-EX-01 | Expense with amount = 1 paisa | Allow minimum positive amount |
| EC-EX-02 | Upload receipt then delete expense | Orphan file acceptable v1; cleanup job Phase 2 |
| EC-EX-03 | Category removed from settings but used in old expenses | Retain category value on record; display as-is |
| EC-EX-04 | Large expense (e.g., annual insurance) | Allow; owner may use notes for amortization context |
| EC-EX-05 | Duplicate expense same day same amount | Allow — user may have legitimate duplicates |
| EC-EX-06 | Edit expense date | Recalculate summaries on old and new dates |
| EC-EX-07 | Production staff navigates to /expenses | 403 or hidden nav item |

---

## 12. Acceptance Criteria

- [ ] Manager can create expense with all required fields.
- [ ] Category dropdown populated from org settings.
- [ ] Receipt uploads and displays on detail page.
- [ ] List filters by date range and category.
- [ ] Edit and delete work on open days.
- [ ] Closed day blocks mutations when enabled.
- [ ] Daily summary expense total updates on save/edit/delete.
- [ ] No inventory side effects.
- [ ] Only Owner/Manager can access module.

---

## 13. Future Enhancements

| Priority | Enhancement |
|---|---|
| P1 | Recurring expense templates (monthly rent auto-entry) |
| P2 | Expense approval workflow |
| P2 | Budget vs actual by category |
| P2 | Bulk expense import |
| P3 | Integration with accounting software (Tally, QuickBooks) |
| P3 | Mileage/transport log sub-module |
| P3 | Petty cash tracking |

---

*Simple module by design. Resist scope creep — keep v1 as single-entry form without line items.*
