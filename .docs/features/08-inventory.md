# Feature Specification: Inventory

> **Module:** 08 — Inventory  
> **Version:** 1.0  
> **Last updated:** 2026-07-07  
> **Status:** Draft — pending owner approval  
> **Dependencies:** Purchases, Production, Sales, Wastage (all inventory writers)  
> **Dependents:** Dashboard, Daily Summary, all transaction modules (stock hints)

**Related docs:** [BUSINESS.md](../BUSINESS.md) · [DATABASE.md](../DATABASE.md)

---

## 1. Purpose

Inventory provides a **real-time view** of stock levels, valuation, movement history, and low stock alerts for both raw materials and finished products. It is primarily a **read-only derived module** — stock changes only through transactional modules and controlled admin adjustments.

The inventory **service layer** (balances + movements) is built alongside Purchases (Module 03); this module delivers the **UI and reporting views**.

---

## 2. Business Goal

- Give owners and managers instant visibility into current stock and value.
- Provide a complete audit trail of every stock change.
- Alert when raw materials fall below reorder levels.
- Highlight negative stock situations requiring attention.
- Support opening balance setup for new organizations.

**Success metric:** Inventory balances match sum of all movements; low stock alerts accurate within 1 minute of purchase/production/sale.

---

## 3. Users

| Role | Access Level | Primary Actions |
|---|---|---|
| Owner | Read + Adjust | View all; opening balance & adjustments |
| Manager | Read + Adjust | View all; adjustments |
| Production Staff | Read only | View stock levels |
| Sales Staff | Read only | View finished product stock |
| Store Staff | Read only | View finished product stock |

---

## 4. User Stories

- **US-IN-01:** As a manager, I want to see all raw materials with current quantity and value so that I know what we have on hand.
- **US-IN-02:** As an owner, I want to see finished product stock so that I know what's available to sell.
- **US-IN-03:** As a manager, I want low stock items highlighted so that I can reorder before running out.
- **US-IN-04:** As an owner, I want to view movement history for any item so that I can audit stock changes.
- **US-IN-05:** As an owner, I want to set opening balances when starting the system so that initial stock is recorded.
- **US-IN-06:** As a manager, I want to see negative stock items flagged so that I can investigate data issues.
- **US-IN-07:** As production staff, I want to quickly check if we have enough flour so that I can plan production.

---

## 5. Inputs

### 5.1 View Filters — Balances

| Filter | Applies To | Default |
|---|---|---|
| Item type | Raw / Finished / All | All |
| Search | Name | Empty |
| Low stock only | Raw materials | Off |
| Negative stock only | All | Off |

### 5.2 View Filters — Movement Ledger

| Filter | Default |
|---|---|
| Item | None (all) or specific item |
| Date range | Last 30 days |
| Movement type | All |

### 5.3 Stock Adjustment (Admin Only)

| Field | Type | Required | Notes |
|---|---|---|---|
| `itemType` | enum | Yes | raw_material \| finished_product |
| `itemId` | reference | Yes | — |
| `adjustmentType` | enum | Yes | `OPENING_BALANCE` \| `ADJUSTMENT_IN` \| `ADJUSTMENT_OUT` |
| `quantity` | number | Yes | > 0 |
| `unitCost` | money | Conditional | Required for IN / opening balance |
| `reason` | string | Yes | Max 500 chars |
| `adjustmentDate` | date | Yes | Default today |

---

## 6. Outputs

### 6.1 Inventory Balances View

**Raw Materials tab:**

| Column | Description |
|---|---|
| Name | Raw material name |
| Quantity | Current stock |
| Unit | kg, g, etc. |
| Avg Cost | WAC per unit |
| Total Value | qty × avg cost |
| Reorder Level | From master |
| Status | OK / Low / Negative |

**Finished Products tab:**

| Column | Description |
|---|---|
| Name | Product name |
| Quantity | Current stock |
| Unit | piece, dozen, etc. |
| Avg Cost | WAC per unit |
| Total Value | qty × avg cost |
| Status | OK / Negative |

### 6.2 Summary Bar

- Total raw material value
- Total finished product value
- Combined inventory value
- Count of low stock items
- Count of negative stock items

### 6.3 Movement Ledger

- Chronological list: date, item, type, quantity, unit cost, balance after, source document link.
- Filterable by item and date.

### 6.4 Low Stock Alerts Panel

- List of raw materials where `quantity ≤ reorderLevel`.
- Used by Dashboard widget.

### 6.5 Side Effects (Adjustment Only)

- Create `OPENING_BALANCE`, `ADJUSTMENT_IN`, or `ADJUSTMENT_OUT` movement.
- Update balance and WAC (for IN types).
- Does not recalculate daily summary (adjustments are balance corrections, not P&L in v1 unless owner specifies).

---

## 7. Business Rules

| # | Rule |
|---|---|
| BR-IN-01 | Inventory is never edited directly except via stock adjustment (admin). |
| BR-IN-02 | All transactional modules create movements; Inventory UI is read-only except adjustments. |
| BR-IN-03 | Movements are append-only — reversals create compensating entries, never delete. |
| BR-IN-04 | WAC methodology for both raw and finished products. |
| BR-IN-05 | Low stock: `isLowStock = reorderLevel != null && quantity <= reorderLevel`. |
| BR-IN-06 | Negative stock allowed; `isNegative` flag on balance. |
| BR-IN-07 | Opening balance setup uses `OPENING_BALANCE` movement type — typically during onboarding. |
| BR-IN-08 | Adjustments require reason text (audit). |
| BR-IN-09 | Only Owner and Manager can perform adjustments. |
| BR-IN-10 | Movement ledger links to source document (purchase, production, sale, wastage). |
| BR-IN-11 | `currentStock` on product/rawMaterial masters is denormalized from balance — display either source consistently. |
| BR-IN-12 | Inventory views refresh after transactional mutations (query invalidation). |

---

## 8. Validation Rules

### Stock Adjustment

| Field | Validation | Error Message |
|---|---|---|
| `itemType` | Required enum | "Select item type" |
| `itemId` | Valid active item | "Select an item" |
| `quantity` | > 0 | "Quantity must be greater than zero" |
| `unitCost` | Required for IN/opening; ≥ 0 | "Unit cost required" |
| `reason` | Required; 1–500 chars | "Reason is required" |
| `adjustmentDate` | Valid date | "Invalid date" |
| ADJUSTMENT_OUT | quantity ≤ current stock | Warn if exceeds; allow with confirmation |

---

## 9. Firestore Collections Used

| Collection | Operation | Purpose |
|---|---|---|
| `organizations/{orgId}/inventory/balances/{itemKey}` | Read/Write (adjust only) | Current balances |
| `organizations/{orgId}/inventory/movements/{movementId}` | Read/Write (adjust only) | Movement ledger |
| `organizations/{orgId}/rawMaterials/{id}` | Read/Update | Names, reorder, denorm stock |
| `organizations/{orgId}/products/{id}` | Read/Update | Names, denorm stock |
| `organizations/{orgId}/purchases/{id}` | Read | Source doc links |
| `organizations/{orgId}/production/{id}` | Read | Source doc links |
| `organizations/{orgId}/sales/{id}` | Read | Source doc links |
| `organizations/{orgId}/wastage/{id}` | Read | Source doc links |

**Indexes:**

- `(organizationId, itemType, itemName)` on balances
- `(organizationId, isLowStock, itemName)`
- `(organizationId, isNegative)`
- `(organizationId, itemId, createdAt DESC)` on movements
- `(organizationId, movementDate DESC)` on movements

---

## 10. UI Components

### Pages

| Route | Description |
|---|---|
| `/inventory` | Balances view (tabs) |
| `/inventory/movements` | Full movement ledger |
| `/inventory/low-stock` | Low stock alerts |
| `/inventory/adjustments/new` | Stock adjustment form (admin) |
| `/inventory/[itemKey]` | Item detail + movement history |

### Module-Specific Components

| Component | Description |
|---|---|
| `InventoryBalanceTabs` | Raw Materials / Finished Products tabs |
| `InventoryBalanceTable` | Balance list with status badges |
| `InventorySummaryBar` | Total values, alert counts |
| `MovementLedgerTable` | Paginated movement history |
| `MovementTypeBadge` | Color-coded movement type |
| `LowStockList` | Compact list for dashboard |
| `StockAdjustmentForm` | Admin adjustment entry |
| `InventoryItemDetail` | Item header + movement history |
| `SourceDocumentLink` | Link to purchase/production/sale/wastage |

### Shared Components

`PageHeader`, `DataTable`, `MoneyDisplay`, `StatusBadge`, `EmptyState`, `ConfirmDialog`, `DateRangeFilter`

### shadcn/ui Primitives

`Tabs`, `Table`, `Badge`, `Alert`, `Card`, `Button`, `Dialog`, `Skeleton`

---

## 11. Edge Cases

| # | Scenario | Expected Behavior |
|---|---|---|
| EC-IN-01 | Item with no movements | Show zero balance or hidden until first transaction |
| EC-IN-02 | Opening balance on item with existing movements | Block — opening balance only for zero-movement items |
| EC-IN-03 | 1000+ movements for one item | Paginate ledger; load more |
| EC-IN-04 | Balance denorm out of sync with movements | Admin repair script Phase 2; prevent at write time |
| EC-IN-05 | Click movement source link to deleted document | Show "Document deleted" with snapshot info from movement |
| EC-IN-06 | Reorder level null | Never show in low stock |
| EC-IN-07 | Finished product low stock | Not supported v1 (no reorder on products) — future enhancement |
| EC-IN-08 | Real-time update while viewing inventory | TanStack Query invalidation on mutations |

---

## 12. Acceptance Criteria

- [ ] Balances view shows correct quantities matching last movement `balanceAfter`.
- [ ] Raw and finished tabs filter correctly.
- [ ] Low stock filter shows only items at or below reorder level.
- [ ] Negative stock items flagged in red.
- [ ] Movement ledger shows all movement types with source links.
- [ ] Item detail page shows movement history filtered to that item.
- [ ] Admin can create opening balance for new item with zero history.
- [ ] Admin adjustment creates movement and updates balance.
- [ ] Non-admin users cannot access adjustment form.
- [ ] Total inventory value calculates correctly.
- [ ] Dashboard low stock widget uses same data source.

---

## 13. Future Enhancements

| Priority | Enhancement |
|---|---|
| P1 | Reorder level on finished products |
| P2 | Stock take / physical count reconciliation |
| P2 | Export inventory report PDF/Excel |
| P2 | Batch/lot tracking in ledger |
| P3 | Expiry date tracking for raw materials |
| P3 | Automatic reorder suggestions |
| P3 | Warehouse location/bin tracking |
| P3 | Inventory valuation report (FIFO option) |

---

*Inventory UI ships after all four inventory-writing transaction modules are complete. Service layer ships with Purchases.*
