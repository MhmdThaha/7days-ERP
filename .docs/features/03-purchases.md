# Feature Specification: Raw Material Purchases

> **Module:** 03 — Raw Material Purchases  
> **Version:** 1.0  
> **Last updated:** 2026-07-07  
> **Status:** Draft — pending owner approval  
> **Dependencies:** Recipe Master (Raw Materials), Inventory service (balances/movements)  
> **Dependents:** Inventory, Daily Summary, Monthly Summary, Dashboard

**Related docs:** [BUSINESS.md](../BUSINESS.md) · [DATABASE.md](../DATABASE.md)

---

## 1. Purpose

Raw Material Purchases records every acquisition of ingredients and supplies from suppliers. Each purchase increases raw material inventory and recalculates the **weighted average cost (WAC)** — the financial foundation for recipe costing, production COGS, and profitability reporting.

---

## 2. Business Goal

- Accurately record what was bought, from whom, at what cost, and when.
- Automatically update raw material stock levels and average costs.
- Provide purchase history for supplier analysis and cost tracking.
- Feed daily and monthly financial summaries with purchase totals.

**Success metric:** Every purchase creates correct inventory IN movements; WAC calculation matches manual verification within integer rounding.

---

## 3. Users

| Role | Access Level | Primary Actions |
|---|---|---|
| Owner | Full CRUD | Create, edit, delete purchases |
| Manager | Full CRUD | Create, edit, delete purchases |
| Production Staff | Read only | View purchase history |
| Sales Staff | No access | — |
| Store Staff | No access | — |

---

## 4. User Stories

- **US-PU-01:** As a manager, I want to record a purchase with supplier, date, and multiple line items so that inventory updates automatically.
- **US-PU-02:** As an owner, I want to see the total purchase amount calculated from line items so that I don't make arithmetic errors.
- **US-PU-03:** As a manager, I want supplier name autocomplete from previous entries so that data entry is faster and consistent.
- **US-PU-04:** As a manager, I want to edit a purchase made today if I entered wrong quantities so that inventory stays accurate.
- **US-PU-05:** As an owner, I want to filter purchases by date range and supplier so that I can review spending patterns.
- **US-PU-06:** As a manager, I want to attach an invoice number for accounting reference.
- **US-PU-07:** As an owner, I want purchases on a closed day to be read-only so that historical records are protected.

---

## 5. Inputs

### 5.1 Purchase Header

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `purchaseDate` | date | Yes | Today (org TZ) | YYYY-MM-DD |
| `supplierName` | string | Yes | — | Max 120 chars; autocomplete |
| `invoiceNumber` | string | No | null | Max 60 chars |
| `paymentStatus` | enum | Yes | `paid` | `paid` \| `credit` |
| `notes` | string | No | null | Max 1000 chars |

### 5.2 Line Items (≥ 1 required)

| Field | Type | Required | Notes |
|---|---|---|---|
| `rawMaterialId` | reference | Yes | Active raw material |
| `quantity` | number | Yes | > 0 |
| `unit` | string | Yes | From raw material master |
| `unitCost` | money | Yes | ≥ 0; minor units |
| `lineTotal` | money | Computed | quantity × unitCost |

### 5.3 List Filters

| Filter | Default |
|---|---|
| Date range | This month |
| Supplier | All |
| Search | Invoice number, supplier name |

---

## 6. Outputs

### 6.1 Purchase List

- Table: date, supplier, invoice #, line count, total amount, payment status, created by.
- Date range filter; pagination 25/page.

### 6.2 Purchase Detail

- Full header + line items table with material names, qty, unit cost, line totals.
- Running total; audit info.

### 6.3 Side Effects (on save)

For each line item:

1. Create `PURCHASE_IN` inventory movement.
2. Update raw material inventory balance (quantity ↑, WAC recalculated).
3. Update `rawMaterials.currentStock` and `rawMaterials.averageCost` (denormalized).
4. Recalculate `dailySummaries/{purchaseDate}`.

**WAC formula:**

```
newAvgCost = (existingQty × existingAvgCost + purchasedQty × unitCost) / (existingQty + purchasedQty)
```

If `existingQty = 0`, `newAvgCost = unitCost`.

---

## 7. Business Rules

| # | Rule |
|---|---|
| BR-PU-01 | Each line item creates one inventory IN movement. |
| BR-PU-02 | WAC recalculated on every purchase line. |
| BR-PU-03 | Purchase must have at least one line item. |
| BR-PU-04 | Only active raw materials selectable. |
| BR-PU-05 | Edit purchase: reverse all original movements, apply new ones (atomic transaction). |
| BR-PU-06 | Delete purchase: soft delete document + reversal movements (atomic). |
| BR-PU-07 | If day close enabled and date is closed, block create/edit/delete. |
| BR-PU-08 | `purchaseDate` cannot be > 7 days future or > 90 days past (manager override Phase 2). |
| BR-PU-09 | `totalAmount` = Σ lineTotals — never manually entered. |
| BR-PU-10 | Supplier name is free text in v1 (no supplier master validation). |
| BR-PU-11 | Payment status `credit` is informational only in v1 — no payables tracking. |
| BR-PU-12 | Returns to supplier not in v1 scope — use stock adjustment in Inventory module. |

---

## 8. Validation Rules

| Field | Validation | Error Message |
|---|---|---|
| `purchaseDate` | Required; valid date; within allowed range | "Invalid purchase date" |
| `purchaseDate` | Not on closed day (if day close enabled) | "This day is closed. Cannot modify purchases." |
| `supplierName` | Required; 1–120 chars | "Supplier name is required" |
| `lineItems` | Min 1 item | "Add at least one line item" |
| `lineItems[].rawMaterialId` | Valid active raw material | "Select a raw material" |
| `lineItems[].quantity` | > 0 | "Quantity must be greater than zero" |
| `lineItems[].unitCost` | ≥ 0 | "Unit cost cannot be negative" |
| `invoiceNumber` | Max 60 chars | "Invoice number too long" |

---

## 9. Firestore Collections Used

| Collection | Operation | Purpose |
|---|---|---|
| `organizations/{orgId}/purchases/{purchaseId}` | CRUD | Purchase records |
| `organizations/{orgId}/rawMaterials/{rawMaterialId}` | Read/Update | Material reference; denormalized stock/cost |
| `organizations/{orgId}/inventory/balances/raw_{id}` | Read/Write | Balance updates |
| `organizations/{orgId}/inventory/movements/{movementId}` | Write | PURCHASE_IN ledger entries |
| `organizations/{orgId}/dailySummaries/{date}` | Write | Recalculate purchase total |
| `organizations/{orgId}/dailySummaries/{date}` | Read | Check day close status |

**Transaction scope:** Purchase doc + N movements + N balance updates + daily summary recalc.

**Indexes:**

- `(organizationId, purchaseDate DESC)`
- `(organizationId, purchaseDate, deletedAt)`

---

## 10. UI Components

### Pages

| Route | Description |
|---|---|
| `/purchases` | Purchase list with date filter |
| `/purchases/new` | Create purchase (line-item form) |
| `/purchases/[id]` | View/edit purchase |

### Shared Components

`PageHeader`, `DataTable`, `DatePicker`, `DateRangeFilter`, `MoneyInput`, `MoneyDisplay`, `ItemCombobox` (materials), `ConfirmDialog`, `EmptyState`, `LoadingSkeleton`

### Module-Specific Components

| Component | Description |
|---|---|
| `PurchaseForm` | Header fields + line items |
| `PurchaseLineItemRow` | Material picker, qty, unit cost, line total, remove |
| `PurchaseLineItemsTable` | Editable line items with add row |
| `PurchaseTotalBar` | Sticky running total |
| `SupplierAutocomplete` | Suggest previous supplier names (cached from recent purchases) |
| `PurchaseDetailView` | Read-only view for closed days |

### shadcn/ui Primitives

`Button`, `Input`, `Select`, `Form`, `Card`, `Table`, `Calendar`, `Popover`, `Badge` (payment status), `Alert` (closed day warning)

---

## 11. Edge Cases

| # | Scenario | Expected Behavior |
|---|---|---|
| EC-PU-01 | Purchase with 20 line items | Atomic transaction; rollback on any failure |
| EC-PU-02 | Edit purchase after subsequent production used materials | WAC recalculates; warn "Cost basis changed" — no block |
| EC-PU-03 | Delete purchase that was only source of material stock | Stock decreases; may go negative — allow with warning |
| EC-PU-04 | First ever purchase for material (stock was 0) | WAC = unitCost |
| EC-PU-05 | Purchase with unitCost = 0 (free sample) | Allow; WAC reflects zero-cost addition |
| EC-PU-06 | Duplicate raw material in two lines | Allow (different costs possible) or warn — recommend separate lines OK |
| EC-PU-07 | Save fails mid-transaction | Full rollback; no partial inventory update |
| EC-PU-08 | View purchase on closed day | Read-only; edit/delete hidden |
| EC-PU-09 | Purchase date changed on edit | Reverse on old date summary; apply on new date summary |
| EC-PU-10 | Offline save attempt | Error toast; no partial save |

---

## 12. Acceptance Criteria

- [ ] Manager can create purchase with multiple line items; total auto-calculated.
- [ ] Saving creates correct PURCHASE_IN movements for each line.
- [ ] Raw material balance quantity increases by purchased qty.
- [ ] WAC recalculated correctly (verified with test cases).
- [ ] Edit reverses old movements and applies new ones atomically.
- [ ] Delete soft-deletes purchase and creates reversal movements.
- [ ] Daily summary `totalPurchases` updates on save/edit/delete.
- [ ] List filters by date range and shows paginated results.
- [ ] Supplier autocomplete suggests recent supplier names.
- [ ] Closed day purchases are read-only when day close enabled.
- [ ] Production staff cannot create/edit/delete purchases.

---

## 13. Future Enhancements

| Priority | Enhancement |
|---|---|
| P1 | Supplier master with contact info and payment terms |
| P2 | Accounts payable tracking for credit purchases |
| P2 | Purchase returns / debit notes |
| P2 | Attach invoice PDF/image |
| P2 | Purchase order workflow (PO → GRN) |
| P3 | Multi-currency purchases |
| P3 | Bulk purchase import from CSV |
| P3 | Supplier price history and comparison |

---

*First module that writes to inventory. Inventory balance/movement services must be implemented alongside this module.*
