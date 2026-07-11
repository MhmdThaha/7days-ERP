# Feature Specification: Wastage

> **Module:** 07 — Wastage  
> **Version:** 1.0  
> **Last updated:** 2026-07-07  
> **Status:** Draft — pending owner approval  
> **Dependencies:** Product Master, Recipe Master (Raw Materials), Inventory service  
> **Dependents:** Inventory, Daily Summary, Monthly Summary, Dashboard

**Related docs:** [BUSINESS.md](../BUSINESS.md) · [DATABASE.md](../DATABASE.md)

---

## 1. Purpose

Wastage records loss of raw materials or finished products due to expiry, damage, overproduction, quality rejection, or other reasons. Each wastage entry reduces inventory and captures the **estimated cost** (WAC × quantity) to reflect true profitability.

---

## 2. Business Goal

- Track all product and material losses with reasons.
- Automatically reduce inventory on wastage recording.
- Include wastage cost in net profit calculation.
- Identify patterns of waste for operational improvement.
- Explain inventory shrinkage not accounted for by sales.

**Success metric:** Wastage cost in Daily Summary equals sum of wastage entry costs; inventory balances decrease correctly.

---

## 3. Users

| Role | Access Level | Primary Actions |
|---|---|---|
| Owner | Full CRUD | All dates |
| Manager | Full CRUD | All dates |
| Production Staff | Create/Edit/Delete | Current day |
| Sales Staff | No access | — |
| Store Staff | Create | Current day (limited) |

---

## 4. User Stories

- **US-WA-01:** As production staff, I want to record finished product wastage with reason so that expired bread is tracked.
- **US-WA-02:** As a manager, I want to record raw material wastage (e.g., spilled flour) so that inventory reflects actual stock.
- **US-WA-03:** As an owner, I want wastage cost auto-calculated from average cost so that profit impact is accurate.
- **US-WA-04:** As a manager, I want to filter wastage by date and reason so that I can identify recurring problems.
- **US-WA-05:** As production staff, I want to toggle between raw material and finished product so that I record the correct type of loss.
- **US-WA-06:** As an owner, I want wastage totals in daily summary so that I see the full cost of waste each day.

---

## 5. Inputs

### 5.1 Wastage Entry

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `wastageDate` | date | Yes | Today | YYYY-MM-DD |
| `itemType` | enum | Yes | — | `raw_material` \| `finished_product` |
| `itemId` | reference | Yes | — | rawMaterialId or productId |
| `quantity` | number | Yes | — | > 0 |
| `unit` | string | Auto | From item master |
| `reason` | string | Yes | — | From org settings wastage reasons |
| `estimatedCost` | money | Computed | WAC × qty | Editable with override reason |
| `notes` | string | No | null | Max 500 chars |

**System-captured:**

| Field | Source |
|---|---|
| `itemName` | Snapshot from master |
| `unitCost` | WAC at save time |

### 5.2 List Filters

Date range (default: this month), item type, reason, search (item name).

---

## 6. Outputs

### 6.1 Wastage List

- Table: date, type, item name, quantity, unit, reason, estimated cost, created by.

### 6.2 Wastage Detail

- Full entry with cost breakdown: qty × unit cost = estimated cost.

### 6.3 Side Effects (on save)

1. Create `WASTAGE_OUT` inventory movement (mapped as OUT type `WASTAGE_OUT`).
2. Decrease item balance (raw or finished).
3. Update denormalized `currentStock`.
4. Recalculate `dailySummaries/{wastageDate}`.

---

## 7. Business Rules

| # | Rule |
|---|---|
| BR-WA-01 | Wastage always decreases inventory — never increases. |
| BR-WA-02 | `estimatedCost = quantity × WAC` at save time unless manually overridden. |
| BR-WA-03 | Manual cost override requires note explaining reason. |
| BR-WA-04 | Wastage reduces net profit in daily/monthly summaries. |
| BR-WA-05 | Cannot record negative wastage — use production or purchase to add stock. |
| BR-WA-06 | Item must be active in respective master. |
| BR-WA-07 | Edit: reverse movement, reapply (atomic). |
| BR-WA-08 | Delete: soft delete + reversal. |
| BR-WA-09 | Closed day: no mutations when enabled. |
| BR-WA-10 | Wastage quantity can exceed current stock — allow with warning (similar to sales). |
| BR-WA-11 | Store staff can create but not edit/delete others' entries (v1: same as production staff — current day only). |

---

## 8. Validation Rules

| Field | Validation | Error Message |
|---|---|---|
| `wastageDate` | Required; valid; within policy | "Invalid date" |
| `wastageDate` | Not closed day | "This day is closed" |
| `itemType` | Required enum | "Select item type" |
| `itemId` | Valid active item of correct type | "Select an item" |
| `quantity` | > 0 | "Quantity must be greater than zero" |
| `reason` | Valid org reason | "Select a reason" |
| `estimatedCost` | ≥ 0 | "Cost cannot be negative" |
| Cost override | Notes required if cost ≠ auto calc | "Explain cost override in notes" |

---

## 9. Firestore Collections Used

| Collection | Operation | Purpose |
|---|---|---|
| `organizations/{orgId}/wastage/{wastageId}` | CRUD | Wastage records |
| `organizations/{orgId}/products/{id}` | Read | Finished product reference |
| `organizations/{orgId}/rawMaterials/{id}` | Read | Raw material reference |
| `organizations/{orgId}/inventory/balances/{itemKey}` | Read/Write | Balance decrease |
| `organizations/{orgId}/inventory/movements/{movementId}` | Write | WASTAGE_OUT |
| `organizations/{orgId}/dailySummaries/{date}` | Write | Recalculate |
| `organizations/{orgId}/settings/config` | Read | Wastage reasons |

---

## 10. UI Components

### Pages

| Route | Description |
|---|---|
| `/wastage` | Wastage list |
| `/wastage/new` | Record wastage |
| `/wastage/[id]` | View/edit |

### Module-Specific Components

| Component | Description |
|---|---|
| `WastageForm` | Type toggle, item picker, qty, reason, cost |
| `WastageItemTypeToggle` | Raw material vs finished product switch |
| `WastageItemPicker` | Context-aware combobox (materials or products) |
| `WastageCostDisplay` | Auto cost with optional override field |
| `WastageReasonSelect` | Reason dropdown |

### Shared Components

`PageHeader`, `DatePicker`, `DateRangeFilter`, `QuantityInput`, `MoneyDisplay`, `ConfirmDialog`, `EmptyState`

### shadcn/ui Primitives

`Button`, `Form`, `Card`, `Select`, `Switch` or `Tabs` (type toggle), `Alert`

---

## 11. Edge Cases

| # | Scenario | Expected Behavior |
|---|---|---|
| EC-WA-01 | Wastage qty > current stock | Warn; allow; stock may go negative |
| EC-WA-02 | WAC = 0 for item | estimatedCost = 0; allow with note |
| EC-WA-03 | Switch item type mid-form | Clear item selection and reset cost |
| EC-WA-04 | Record wastage then delete | Inventory restored via reversal |
| EC-WA-05 | Same item multiple wastage entries same day | All apply cumulatively |
| EC-WA-06 | Override cost to 0 | Require notes |
| EC-WA-07 | Inactive item in historical wastage | Display name from snapshot; item inactive in master |

---

## 12. Acceptance Criteria

- [ ] User can toggle item type and select appropriate item.
- [ ] Cost auto-calculates from WAC × quantity.
- [ ] Save creates WASTAGE_OUT movement and decreases stock.
- [ ] Daily summary wastage cost updates.
- [ ] Edit/delete reverses inventory correctly.
- [ ] List filters by date, type, and reason.
- [ ] Role permissions enforced (production/store create for today).
- [ ] Cost override requires notes when different from auto.

---

## 13. Future Enhancements

| Priority | Enhancement |
|---|---|
| P2 | Wastage approval for high-value items |
| P2 | Photo attachment of wasted items |
| P2 | Wastage analytics dashboard (trends by reason) |
| P2 | Link wastage to production batch |
| P3 | Target wastage % KPI with alerts |
| P3 | Automatic wastage suggestions from production vs sales gap |

---

*Wastage completes the set of inventory OUT transaction types alongside Sales and Production (raw OUT).*
