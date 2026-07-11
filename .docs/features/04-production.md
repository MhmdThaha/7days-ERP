# Feature Specification: Daily Production

> **Module:** 04 — Daily Production  
> **Version:** 1.0  
> **Last updated:** 2026-07-07  
> **Status:** Draft — pending owner approval  
> **Dependencies:** Product Master, Recipe Master, Inventory service  
> **Dependents:** Inventory, Daily Summary, Monthly Summary, Dashboard

**Related docs:** [BUSINESS.md](../BUSINESS.md) · [DATABASE.md](../DATABASE.md)

---

## 1. Purpose

Daily Production records the quantity of finished products baked or manufactured on a given date. For each production line, the system consumes raw materials per the active recipe (stored as snapshot) and adds finished goods to inventory at recipe-derived unit cost.

This module is the operational bridge between recipes and sellable inventory.

---

## 2. Business Goal

- Record what was produced each day, by product and quantity.
- Automatically deduct raw materials and add finished products to inventory.
- Preserve recipe snapshots so historical cost remains accurate after recipe changes.
- Show material requirements and stock availability before saving.
- Support batch entry of multiple products in one production session.

**Success metric:** Production save completes atomically with correct inventory movements; material consumption matches recipe scaling formula.

---

## 3. Users

| Role | Access Level | Primary Actions |
|---|---|---|
| Owner | Full CRUD | All dates (within policy) |
| Manager | Full CRUD | All dates (within policy) |
| Production Staff | Create/Edit/Delete | Current day only (configurable) |
| Sales Staff | Read only | View production for today |
| Store Staff | Read only | View today's production |

---

## 4. User Stories

- **US-PR-01:** As production staff, I want to record multiple products produced today in one entry so that I don't create separate records for each item.
- **US-PR-02:** As production staff, I want to see required raw materials when I select a product so that I know if we have enough stock.
- **US-PR-03:** As a manager, I want production to automatically deduct raw materials based on the recipe so that inventory stays accurate without manual calculation.
- **US-PR-04:** As an owner, I want the recipe version used at production time saved so that cost reports remain correct after recipe changes.
- **US-PR-05:** As production staff, I want to save production even when stock is insufficient (with warning) so that I don't block operations when inventory data lags.
- **US-PR-06:** As a manager, I want to edit today's production if quantities were entered wrong so that inventory is corrected.
- **US-PR-07:** As an owner, I want to filter production history by date so that I can review past output.

---

## 5. Inputs

### 5.1 Production Header

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `productionDate` | date | Yes | Today | YYYY-MM-DD |
| `shift` | enum | No | null | `morning` \| `evening` \| `night` |
| `notes` | string | No | null | Max 1000 chars |

### 5.2 Production Lines (≥ 1 required)

| Field | Type | Required | Notes |
|---|---|---|---|
| `productId` | reference | Yes | Active product with active recipe |
| `quantity` | number | Yes | > 0; in product unit |
| `unit` | string | Auto | From product master |

**System-captured on save (per line):**

| Field | Source |
|---|---|
| `recipeId` | Product's active recipe |
| `recipeVersion` | Active recipe version |
| `unitCost` | Recipe unit cost at save time |
| `totalCost` | quantity × unitCost |
| `materialBreakdown[]` | Scaled ingredients with costs |
| `productName` | Snapshot from product |

### 5.3 List Filters

Date range (default: today), product, shift.

---

## 6. Outputs

### 6.1 Production List

- Table: date, shift, product count, total units, total cost, created by.
- Expandable row or detail link for line items.

### 6.2 Production Detail

- Header + lines with product, qty, unit cost, total cost, recipe version.
- Material breakdown per line (expandable).

### 6.3 Pre-Save Preview (UI)

- Aggregated raw material requirements across all lines.
- Stock availability vs required (highlight shortages).

### 6.4 Side Effects (on save)

Per line:

1. For each recipe ingredient (scaled): create `PRODUCTION_RAW_OUT` movement; decrease raw material balance.
2. Create `PRODUCTION_FINISHED_IN` movement; increase finished product balance (WAC updated).
3. Update denormalized `currentStock` on products and raw materials.

Then: recalculate `dailySummaries/{productionDate}`.

**Scaling formula:**

```
ingredientConsumed = (lineQuantity / recipeYieldQuantity) × ingredientQuantity
lineUnitCost = recipe unit cost at save time
finishedWAC = weighted average of existing stock + new production cost
```

---

## 7. Business Rules

| # | Rule |
|---|---|
| BR-PR-01 | Product must have an active recipe to be added to production. |
| BR-PR-02 | Each line increases finished product inventory by produced quantity. |
| BR-PR-03 | Each line decreases raw material inventory per scaled recipe. |
| BR-PR-04 | Recipe snapshot (id, version, ingredients, costs) stored on production line — immutable after save. |
| BR-PR-05 | Batch entry: multiple products in one production document. |
| BR-PR-06 | Edit: reverse all original movements, apply new (atomic). |
| BR-PR-07 | Delete: soft delete + reversal movements (atomic). |
| BR-PR-08 | Insufficient raw stock: warn by default; block only if org setting enabled. |
| BR-PR-09 | Production can proceed even if finished product stock goes negative on raw side. |
| BR-PR-10 | Closed day: no create/edit/delete when day close enabled. |
| BR-PR-11 | Production staff limited to current day unless role elevated. |
| BR-PR-12 | Duplicate product in same entry: allowed (separate lines) or merge — recommend separate lines for different batches. |
| BR-PR-13 | `totalUnits` and `totalCost` computed — not user input. |

---

## 8. Validation Rules

| Field | Validation | Error Message |
|---|---|---|
| `productionDate` | Required; valid; within date policy | "Invalid production date" |
| `productionDate` | Not closed day | "This day is closed" |
| `lines` | Min 1 line | "Add at least one product" |
| `lines[].productId` | Active product with active recipe | "Product requires an active recipe" |
| `lines[].quantity` | > 0 | "Quantity must be greater than zero" |
| `lines[].productId` | No duplicate check required | — |
| Insufficient stock | Warning (or block per setting) | "Insufficient {material}: need {x}, have {y}" |

---

## 9. Firestore Collections Used

| Collection | Operation | Purpose |
|---|---|---|
| `organizations/{orgId}/production/{productionId}` | CRUD | Production entries |
| `organizations/{orgId}/products/{productId}` | Read | Product + activeRecipeId |
| `organizations/{orgId}/recipes/{recipeId}` | Read | Recipe for snapshot |
| `organizations/{orgId}/rawMaterials/{id}` | Read/Update | Stock denormalization |
| `organizations/{orgId}/inventory/balances/{itemKey}` | Read/Write | Balance updates |
| `organizations/{orgId}/inventory/movements/{movementId}` | Write | RAW_OUT + FINISHED_IN |
| `organizations/{orgId}/dailySummaries/{date}` | Write | Recalculate |
| `organizations/{orgId}/settings/config` | Read | Block vs warn setting |

**Transaction size consideration:** Production with 5 products × 8 ingredients = up to 45 movements + 1 doc — within Firestore 500 op limit.

---

## 10. UI Components

### Pages

| Route | Description |
|---|---|
| `/production` | Production list |
| `/production/new` | Create production entry |
| `/production/[id]` | View/edit production |

### Module-Specific Components

| Component | Description |
|---|---|
| `ProductionForm` | Date, shift, lines, notes |
| `ProductionLineRow` | Product picker, qty, unit, remove |
| `ProductionMaterialPreview` | Aggregated material requirements vs stock |
| `MaterialRequirementTable` | Material, required, available, status |
| `ProductionLineBreakdown` | Expandable material detail per line |
| `StockWarningBanner` | Insufficient stock alert |
| `ProductCombobox` | Active products with recipe only |

### Shared Components

`PageHeader`, `DatePicker`, `DateRangeFilter`, `QuantityInput`, `ConfirmDialog`, `EmptyState`, `MoneyDisplay`, `LoadingSkeleton`

### shadcn/ui Primitives

`Button`, `Form`, `Card`, `Table`, `Select`, `Alert`, `Badge`, `Collapsible`

---

## 11. Edge Cases

| # | Scenario | Expected Behavior |
|---|---|---|
| EC-PR-01 | Product recipe updated after production saved | Historical production unchanged (snapshot) |
| EC-PR-02 | Production qty = 0.5 (half batch) | Scaling works with decimal quantities |
| EC-PR-03 | Raw material stock goes negative after production | Allow (default); flag negative in inventory |
| EC-PR-04 | Edit production to remove a line | Reverse movements for removed line only |
| EC-PR-05 | Production for product with no prior stock | Finished WAC = recipe unit cost |
| EC-PR-06 | Two production entries same day same product | Both apply; inventory cumulative |
| EC-PR-07 | Recipe yield = 24, produce 12 | Scale ingredients at 50% |
| EC-PR-08 | Firestore transaction fails | Full rollback; user sees error |
| EC-PR-09 | Production staff tries to edit yesterday | Block unless manager role |
| EC-PR-10 | 10 products in one entry | Performance acceptable; single transaction if under op limit |

---

## 12. Acceptance Criteria

- [ ] User can create production with multiple product lines.
- [ ] Products without active recipe cannot be selected.
- [ ] Material preview shows scaled requirements before save.
- [ ] Insufficient stock shows warning (or blocks per setting).
- [ ] Save creates correct RAW_OUT and FINISHED_IN movements.
- [ ] Recipe snapshot stored on each line including version and breakdown.
- [ ] Finished product WAC updated correctly after production.
- [ ] Edit/delete correctly reverses and reapplies movements.
- [ ] Daily summary production metrics update.
- [ ] Production staff restricted to today; manager/owner broader access.
- [ ] Closed day enforcement when enabled.

---

## 13. Future Enhancements

| Priority | Enhancement |
|---|---|
| P2 | Production planning / scheduled production |
| P2 | Batch/lot numbers for traceability |
| P2 | Production templates ("standard morning batch") |
| P2 | Actual vs planned production variance |
| P3 | Semi-finished production steps |
| P3 | Equipment/capacity tracking |
| P3 | Production staff assignment per line |

---

*Production is the first module that affects both raw and finished inventory. Test WAC and movement logic thoroughly before proceeding to Sales.*
