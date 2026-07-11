# Feature Specification: Daily Sales

> **Module:** 05 — Daily Sales  
> **Version:** 1.0  
> **Last updated:** 2026-07-07  
> **Status:** Draft — pending owner approval  
> **Dependencies:** Product Master, Inventory service (finished product balances)  
> **Dependents:** Inventory, Daily Summary, Monthly Summary, Dashboard

**Related docs:** [BUSINESS.md](../BUSINESS.md) · [DATABASE.md](../DATABASE.md)

---

## 1. Purpose

Daily Sales records all revenue-generating transactions — counter sales, wholesale orders, and deliveries. Each sale reduces finished product inventory, captures snapshotted pricing, and computes **Cost of Goods Sold (COGS)** for profit reporting.

This is the highest-frequency transactional module and must be optimized for speed of entry.

---

## 2. Business Goal

- Enable staff to record sales quickly and accurately throughout the day.
- Automatically reduce finished product inventory on each sale.
- Capture price at time of sale (not retroactively affected by master price changes).
- Compute COGS per line for gross profit calculation.
- Support multiple sales channels and payment methods for business analysis.

**Success metric:** Average sale entry time < 30 seconds for a 3-line sale; inventory deduction matches sold quantities.

---

## 3. Users

| Role | Access Level | Primary Actions |
|---|---|---|
| Owner | Full CRUD | All dates |
| Manager | Full CRUD | All dates |
| Production Staff | Read only | View today's sales |
| Sales Staff | Create/Edit/Delete | Current day |
| Store Staff | Create/Edit/Delete | Current day |

---

## 4. User Stories

- **US-SA-01:** As sales staff, I want to quickly add multiple products to a sale with auto-filled prices so that counter transactions are fast.
- **US-SA-02:** As sales staff, I want to search products by name or code so that I find items without scrolling.
- **US-SA-03:** As a manager, I want to apply a discount on a line item so that special pricing is recorded accurately.
- **US-SA-04:** As an owner, I want to see COGS calculated per sale so that I know gross profit for the day.
- **US-SA-05:** As sales staff, I want the system to remember my last channel and payment method so that repetitive entry is faster.
- **US-SA-06:** As a manager, I want to record wholesale sales with customer name so that I can track B2B orders.
- **US-SA-07:** As sales staff, I want a warning when selling more than available stock so that I'm aware of potential inventory issues.
- **US-SA-08:** As an owner, I want to override unit price for a line when needed (e.g., bulk discount) without changing the product master.

---

## 5. Inputs

### 5.1 Sales Header

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `salesDate` | date | Yes | Today | YYYY-MM-DD |
| `channel` | string | Yes | Last used / `counter` | From org settings |
| `paymentMethod` | string | Yes | Last used / `cash` | From org settings |
| `customerName` | string | No | null | Recommended for wholesale |
| `notes` | string | No | null | Max 1000 chars |

### 5.2 Sales Lines (≥ 1 required)

| Field | Type | Required | Notes |
|---|---|---|---|
| `productId` | reference | Yes | Active product |
| `quantity` | number | Yes | > 0 |
| `unit` | string | Auto | From product |
| `unitPrice` | money | Yes | Defaults from product.sellingPrice |
| `discount` | money | No | 0; per line, minor units |
| `lineTotal` | money | Computed | (qty × unitPrice) − discount |

**System-captured on save (per line):**

| Field | Source |
|---|---|
| `productName` | Product snapshot |
| `unitCost` | Product WAC at save time |
| `cogs` | quantity × unitCost |

### 5.3 Computed Header Totals

| Field | Formula |
|---|---|
| `grossTotal` | Σ (qty × unitPrice) |
| `totalDiscount` | Σ discount |
| `netTotal` | Σ lineTotal |
| `totalCogs` | Σ cogs |

### 5.4 List Filters

Date range (default: today), channel, payment method, search (customer, product).

---

## 6. Outputs

### 6.1 Sales List

- Table: date, time, channel, payment, line count, net total, customer, created by.

### 6.2 Sales Detail

- Header + lines with product, qty, unit price, discount, line total, COGS.
- Summary: gross, discount, net, total COGS, gross profit (net − COGS).

### 6.4 Side Effects (on save)

Per line:

1. Create `SALE_OUT` inventory movement.
2. Decrease finished product balance.
3. Update `products.currentStock`.

Then: recalculate `dailySummaries/{salesDate}`.

---

## 7. Business Rules

| # | Rule |
|---|---|
| BR-SA-01 | Each line decreases finished product inventory by sold quantity. |
| BR-SA-02 | `unitPrice` defaults from product master; snapshotted on save. |
| BR-SA-03 | `lineTotal = (quantity × unitPrice) − discount`. |
| BR-SA-04 | Discount cannot exceed line gross (qty × unitPrice). |
| BR-SA-05 | COGS = quantity × product WAC at save time; stored on line. |
| BR-SA-06 | Sale can exceed available stock — warn by default; block if org setting enabled. |
| BR-SA-07 | Only active products in picker. |
| BR-SA-08 | Edit: reverse movements, reapply (atomic). |
| BR-SA-09 | Delete: soft delete + reversal movements. |
| BR-SA-10 | Closed day: no mutations when day close enabled. |
| BR-SA-11 | Sales staff limited to current day. |
| BR-SA-12 | Returns/refunds not in v1 — Phase 2 credit notes. |
| BR-SA-13 | Multiple sales documents per day allowed (each transaction separate). |
| BR-SA-14 | Remember last channel/payment in local session storage (not persisted server-side). |

---

## 8. Validation Rules

| Field | Validation | Error Message |
|---|---|---|
| `salesDate` | Required; valid; within date policy | "Invalid sales date" |
| `salesDate` | Not closed day | "This day is closed" |
| `channel` | Valid org channel | "Invalid sales channel" |
| `paymentMethod` | Valid org method | "Invalid payment method" |
| `lines` | Min 1 | "Add at least one product" |
| `lines[].productId` | Active product | "Select a product" |
| `lines[].quantity` | > 0 | "Quantity must be greater than zero" |
| `lines[].unitPrice` | ≥ 0 | "Price cannot be negative" |
| `lines[].discount` | ≥ 0 and ≤ qty × unitPrice | "Discount cannot exceed line total" |
| Insufficient stock | Warning or block | "Selling {qty} but only {stock} in stock" |

---

## 9. Firestore Collections Used

| Collection | Operation | Purpose |
|---|---|---|
| `organizations/{orgId}/sales/{salesId}` | CRUD | Sales records |
| `organizations/{orgId}/products/{productId}` | Read/Update | Price, stock |
| `organizations/{orgId}/inventory/balances/product_{id}` | Read/Write | Stock deduction |
| `organizations/{orgId}/inventory/movements/{movementId}` | Write | SALE_OUT |
| `organizations/{orgId}/dailySummaries/{date}` | Write | Recalculate |
| `organizations/{orgId}/settings/config` | Read | Channels, block setting |

---

## 10. UI Components

### Pages

| Route | Description |
|---|---|
| `/sales` | Sales list |
| `/sales/new` | New sale (optimized for speed) |
| `/sales/[id]` | View/edit sale |

### Module-Specific Components

| Component | Description |
|---|---|
| `SalesForm` | Fast-entry form with header + lines |
| `SalesLineRow` | Product picker, qty, price, discount, total |
| `SalesTotalBar` | Gross, discount, net, sticky footer |
| `SalesProfitSummary` | Net total, COGS, gross profit (detail view) |
| `ProductCombobox` | Search by name/code; shows stock hint |
| `StockHint` | Inline "Stock: 24" on product select |
| `QuickSaleButton` | Dashboard shortcut to /sales/new |

### Shared Components

`PageHeader`, `DatePicker`, `DateRangeFilter`, `MoneyInput`, `MoneyDisplay`, `QuantityInput`, `ConfirmDialog`, `EmptyState`

### shadcn/ui Primitives

`Button`, `Form`, `Card`, `Table`, `Select`, `Command`, `Popover`, `Badge`, `Alert`

**UX priority:** Large "Save Sale" button; keyboard-friendly tab order; Enter adds new line.

---

## 11. Edge Cases

| # | Scenario | Expected Behavior |
|---|---|---|
| EC-SA-01 | Sell product with 0 stock | Warn; allow unless blocked |
| EC-SA-02 | Product price changed after sale | Sale retains original snapshotted price |
| EC-SA-03 | Product WAC = 0 (no production yet) | COGS = 0; gross profit = full line total |
| EC-SA-04 | 100% discount line | lineTotal = 0; still deducts inventory |
| EC-SA-05 | Edit sale to increase quantity | Additional stock deducted |
| EC-SA-06 | Delete sale restores inventory | Reversal movement created |
| EC-SA-07 | Same product multiple lines in one sale | Allowed (different prices/discounts) |
| EC-SA-08 | Very large quantity (9999) | Validate reasonable max or warn |
| EC-SA-09 | Sales date changed on edit | Summary recalc on both dates |
| EC-SA-10 | Mobile counter use | Responsive; usable on tablet |

---

## 12. Acceptance Criteria

- [ ] Sales staff can create sale with multiple lines in < 30 seconds (3 lines).
- [ ] Product picker searches by name and code; shows stock hint.
- [ ] Unit price auto-fills from product; editable per line.
- [ ] Line total and net total calculate in real time.
- [ ] COGS computed and stored per line on save.
- [ ] Inventory decreases correctly on save.
- [ ] Insufficient stock warning displays (or blocks per setting).
- [ ] Edit/delete correctly reverses inventory.
- [ ] Daily summary sales and COGS metrics update.
- [ ] Channel and payment method from org settings.
- [ ] Role restrictions enforced.

---

## 13. Future Enhancements

| Priority | Enhancement |
|---|---|
| P1 | Sales returns / credit notes |
| P2 | POS mode (fullscreen, touch-optimized) |
| P2 | Barcode scan to add product |
| P2 | Customer master for wholesale |
| P2 | Split payment (part cash, part UPI) |
| P3 | Tax (GST) line breakdown |
| P3 | Printed receipt |
| P3 | Daily sales target tracking |
| P3 | Integration with external POS |

---

*Sales module must feel fast. Prioritize UX performance over feature breadth in v1.*
