# 7Days Bakery ERP — Business Specification

> **Document purpose:** Single source of truth for business domain, workflows, calculations, and module behavior. All future development must align with this document. When Excel logic and this document conflict, resolve with the product owner before implementing.

**Version:** 1.0  
**Last updated:** 2026-07-07  
**Status:** Draft — pending owner approval

---

## 1. Executive Summary

7Days Bakery ERP is a cloud-based enterprise resource planning system designed for **small, independent bakery businesses**. It replaces a proven Microsoft Excel workbook with a collaborative, automated, multi-user web application while **preserving validated business logic**.

The product is intended for **commercial sale** to local bakeries — not as a demo, tutorial, or shortcut MVP. Every module must support real daily operations: production planning, sales recording, inventory control, cost tracking, and owner-level reporting.

### 1.1 Product Vision

Enable bakery owners to answer these questions at any moment:

| Question | Primary Source |
|---|---|
| What did we produce today? | Daily Production |
| What did we sell today? | Daily Sales |
| What did we spend today? | Expenses + Purchases |
| What is today's profit? | Daily Summary |
| What stock do we have? | Inventory |
| What is running low? | Low Stock Alerts |
| What sells best? | Sales Analytics |
| How much did we waste? | Wastage |
| How is the month performing? | Monthly Summary |

### 1.2 Design Philosophy

- **Excel validated the logic; the web app improves the experience.** Do not replicate spreadsheet UX (grid-first, formula cells). Use forms, wizards, dashboards, and guided workflows.
- **One business day = one operational cycle.** Most transactional modules are date-scoped. Historical records are immutable after day close (see Section 8).
- **Inventory is the system of record.** Production, sales, purchases, and wastage all flow through inventory movements — never update stock in isolation.
- **Cost flows from purchases → recipes → production → COGS.** Maintain traceability from raw material cost to finished product margin.

---

## 2. Target Users & Personas

### 2.1 Bakery Owner

- **Goals:** Profit visibility, monthly performance, cost control, inventory health.
- **Usage:** Dashboard, Daily Summary, Monthly Summary, reports, user management.
- **Permissions:** Full access within their organization.

### 2.2 Bakery Manager

- **Goals:** Coordinate production, purchases, staff, and day-end reconciliation.
- **Usage:** All operational modules, day close, low stock review.
- **Permissions:** Operational write access; limited settings.

### 2.3 Production Staff

- **Goals:** Record what was baked/produced today quickly and accurately.
- **Usage:** Daily Production (primary), Wastage (production-related).
- **Permissions:** Create/edit production entries for current day; read product/recipe masters.

### 2.4 Sales Staff

- **Goals:** Record sales by product, channel, or store counter.
- **Usage:** Daily Sales (primary).
- **Permissions:** Create/edit sales entries for current day; read product master.

### 2.5 Store Staff

- **Goals:** Counter sales, basic stock checks, wastage at store level.
- **Usage:** Daily Sales, Wastage (limited).
- **Permissions:** Scoped to assigned store/location if multi-location is enabled.

### 2.6 Assumption: Single-Location Default

**Recommendation:** Launch with **one physical bakery location per organization**. Multi-location (branch) support is a Phase 2 enhancement. Data model should not block it, but UI and permissions should not assume branches until specified.

---

## 3. Core Domain Entities

| Entity | Description |
|---|---|
| **Organization (Tenant)** | A bakery business account. All data is scoped to one org. |
| **User** | Authenticated person belonging to one org with a role. |
| **Product** | Finished good sold to customers (bread, pastry, cake, etc.). |
| **Recipe (BOM)** | Bill of materials linking a product to raw materials and quantities per batch/unit. |
| **Raw Material** | Purchasable ingredient or supply (flour, sugar, packaging). |
| **Purchase** | Acquisition of raw materials from a supplier on a given date. |
| **Production Entry** | Quantity of a product produced on a given date. |
| **Sales Entry** | Quantity of a product sold on a given date (with revenue). |
| **Expense** | Operational cost not tied to inventory (rent, utilities, salaries). |
| **Wastage Entry** | Loss of raw material or finished product (expiry, damage, overproduction). |
| **Inventory Balance** | Current quantity and weighted average cost per item (raw or finished). |
| **Inventory Movement** | Immutable ledger entry for every stock change. |
| **Daily Summary** | Aggregated snapshot for a calendar day. |
| **Monthly Summary** | Aggregated snapshot for a calendar month. |

---

## 4. Module Specifications

Modules must be implemented **one at a time** in dependency order (see `.docs/RULES.md`). Below is the full business definition for each.

---

### 4.1 Product Master

**Purpose:** Canonical catalog of all finished goods the bakery sells or produces.

#### Fields (minimum)

| Field | Type | Rules |
|---|---|---|
| `code` | string | Unique per org; optional auto-generate (e.g., `PRD-001`) |
| `name` | string | Required; searchable |
| `category` | enum/string | e.g., Bread, Pastry, Cake, Snacks, Custom |
| `unit` | enum | piece, kg, g, dozen, tray, box |
| `sellingPrice` | money | Default retail price; can be overridden at sale time |
| `isActive` | boolean | Inactive products hidden from new transactions |
| `description` | string | Optional |
| `imageUrl` | string | Optional; Firebase Storage |

#### Business Rules

1. A product **must exist** before it can appear in recipes, production, or sales.
2. Deactivating a product does **not** delete historical transactions.
3. `sellingPrice` changes do **not** retroactively alter past sales — price is snapshotted on each sales line.
4. Products without an active recipe can still be sold (e.g., resold items) but production cost will be zero unless manually overridden — **warn the user**.

#### Validations

- Name required, max 120 chars.
- Selling price ≥ 0.
- Unit must be from org-configured unit list.

---

### 4.2 Recipe Master

**Purpose:** Define how much of each raw material is consumed to produce one unit (or one batch) of a finished product.

#### Structure

```
Recipe
├── productId (1:1 active recipe per product — see rule below)
├── yieldQuantity (how many product units this recipe produces)
├── yieldUnit
├── ingredients[]
│   ├── rawMaterialId
│   ├── quantity
│   └── unit
├── laborCost (optional, per yield batch)
├── notes
└── isActive
```

#### Business Rules

1. **One active recipe per product** at a time. Historical recipes are versioned, not overwritten.
2. When production is recorded, raw materials are deducted based on the **active recipe at production time** (recipe snapshot stored on production line).
3. Recipe changes do **not** affect past production entries.
4. Ingredient quantities are proportional:  
   `rawMaterialConsumed = (productionQty / recipeYieldQty) × ingredientQty`
5. If a raw material is unavailable in inventory, production may still be saved but system shows **insufficient stock warning** (configurable: block vs warn — default **warn** for v1).

#### Cost Calculation

- **Recipe unit cost** = Σ (ingredient qty × raw material avg cost) + labor cost, divided by yield quantity.
- Raw material avg cost comes from **weighted average cost (WAC)** in inventory at time of production.

---

### 4.3 Raw Material Purchases

**Purpose:** Record incoming stock and update raw material inventory and cost basis.

#### Fields

| Field | Rules |
|---|---|
| `purchaseDate` | Required; defaults to today |
| `supplierName` | Required (free text v1; supplier master Phase 2) |
| `invoiceNumber` | Optional |
| `lineItems[]` | rawMaterialId, quantity, unit, unitCost, lineTotal |
| `totalAmount` | Sum of line totals |
| `paymentStatus` | paid / credit (Phase 2: track payables) |
| `notes` | Optional |

#### Business Rules

1. Each line item creates an **inventory IN movement** for the raw material.
2. **Weighted average cost** is recalculated on each purchase:

   ```
   newAvgCost = (existingQty × existingAvgCost + purchasedQty × unitCost) / (existingQty + purchasedQty)
   ```

3. Purchases are editable on the same day; after day close, purchases are locked (see Section 8).
4. Returns to supplier (negative purchase) are handled as a separate adjustment movement type in v1.1 — not in initial scope unless owner confirms.

#### Validations

- At least one line item.
- Quantity > 0, unitCost ≥ 0.
- Raw material must be active.

---

### 4.4 Daily Production

**Purpose:** Record finished goods produced on a given day; consume raw materials; increase finished goods inventory.

#### Fields

| Field | Rules |
|---|---|
| `productionDate` | Required; defaults to today |
| `lines[]` | productId, quantity, unit, recipeSnapshotId |
| `shift` | Optional: morning / evening / night |
| `notes` | Optional |

#### Business Rules

1. Each line increases **finished product inventory** by produced quantity.
2. Each line decreases **raw material inventory** per recipe (using snapshot).
3. **Production COGS** for the line = produced qty × recipe unit cost at time of production.
4. Batch entry supported: user can add multiple products in one production session.
5. Editing production reverses prior inventory movements and applies new ones (atomic transaction).
6. Deleting production reverses all related inventory movements.

#### Workflow

```
Select date → Add products & quantities → System shows recipe material requirements
→ Validate stock → Save → Inventory updated → Contributes to Daily Summary
```

---

### 4.5 Daily Sales

**Purpose:** Record revenue and reduce finished goods inventory.

#### Fields

| Field | Rules |
|---|---|
| `salesDate` | Required; defaults to today |
| `lines[]` | productId, quantity, unit, unitPrice, lineTotal, discount |
| `channel` | counter / wholesale / delivery (configurable list) |
| `paymentMethod` | cash / card / UPI / credit |
| `customerName` | Optional (wholesale) |
| `notes` | Optional |

#### Business Rules

1. Each line decreases **finished product inventory**.
2. `unitPrice` defaults from product master but is **snapshotted** on save.
3. `lineTotal = (quantity × unitPrice) − discount`.
4. **Gross sales** = Σ line totals.
5. Sales can exceed available inventory — default behavior: **warn but allow** (over-sale may indicate unrecorded production). Configurable to block.
6. Returns/refunds handled as negative sales lines or separate credit note entity in v1.1.

#### COGS on Sale

- **Simple method (recommended v1):** COGS at sale = quantity × product WAC (from production-derived inventory cost).
- COGS is computed at sale time and stored on the line — not recalculated retroactively.

---

### 4.6 Expenses

**Purpose:** Track operational costs not captured through purchases (non-inventory spend).

#### Categories (default)

- Rent
- Utilities (electricity, water, gas)
- Salaries & wages
- Transport & delivery
- Marketing
- Repairs & maintenance
- Miscellaneous

#### Fields

| Field | Rules |
|---|---|
| `expenseDate` | Required |
| `category` | Required |
| `amount` | Required; > 0 |
| `description` | Required |
| `paymentMethod` | Optional |
| `receiptUrl` | Optional attachment |

#### Business Rules

1. Expenses do **not** affect inventory.
2. Expenses reduce **daily and monthly profit**.
3. Recurring expenses (rent) are entered manually in v1; recurring templates in Phase 2.

---

### 4.7 Wastage

**Purpose:** Track loss of raw materials or finished products to explain inventory shrinkage and true profitability.

#### Types

| Type | Effect |
|---|---|
| Raw material wastage | Decrease raw material inventory |
| Finished product wastage | Decrease finished product inventory |

#### Fields

| Field | Rules |
|---|---|
| `wastageDate` | Required |
| `itemType` | raw_material \| finished_product |
| `itemId` | rawMaterialId or productId |
| `quantity` | Required; > 0 |
| `reason` | expiry / damage / overproduction / quality_reject / other |
| `estimatedCost` | Auto from WAC × qty; editable with reason |
| `notes` | Optional |

#### Business Rules

1. Wastage creates an inventory **OUT movement** with type `WASTAGE`.
2. Wastage cost appears in Daily Summary and reduces profit.
3. Wastage cannot be negative (no "negative wastage" — use production or purchase adjustment instead).

---

### 4.8 Inventory

**Purpose:** Real-time view of stock levels, valuation, and movement history.

#### Views

1. **Raw Materials** — quantity, unit, avg cost, total value, reorder level, status.
2. **Finished Products** — quantity, unit, avg cost, total value.
3. **Movement Ledger** — chronological audit of all IN/OUT/ADJUSTMENT/WASTAGE/PRODUCTION/SALE events.
4. **Low Stock Alerts** — items where `currentQty ≤ reorderLevel`.

#### Business Rules

1. **Inventory is never edited directly** except through:
   - Purchases (raw IN)
   - Production (raw OUT, finished IN)
   - Sales (finished OUT)
   - Wastage (OUT)
   - Stock adjustment (admin-only, requires reason — opening balance setup uses this)

2. **Opening balances:** On org setup, admin enters opening stock via controlled stock adjustment with type `OPENING_BALANCE`.

3. **Reorder level:** Optional per raw material. When set, item appears in low stock alerts.

4. **Negative inventory:** Allowed with warning flag on item. Dashboard highlights negative items.

#### Valuation Method

- **Weighted Average Cost (WAC)** for both raw materials and finished products.
- Finished product WAC updated when production adds stock at computed recipe cost.

---

### 4.9 Daily Summary

**Purpose:** End-of-day snapshot answering "How did today go?"

#### Computed Metrics (per calendar day, org timezone)

| Metric | Formula / Source |
|---|---|
| Total Production (units) | Σ production line quantities (optional: by category) |
| Total Sales (revenue) | Σ sales line totals |
| Total Purchases | Σ purchase totals |
| Total Expenses | Σ expense amounts |
| Total Wastage Cost | Σ wastage estimated costs |
| COGS | Σ sales line COGS |
| **Gross Profit** | Total Sales − COGS |
| **Net Profit** | Gross Profit − Expenses − Wastage Cost |
| Profit Margin % | (Net Profit / Total Sales) × 100, if sales > 0 |
| Top Products (by qty) | Rank from sales lines |
| Production vs Sales Gap | Produced qty − sold qty per product (over/under) |

#### Business Rules

1. Daily Summary is **derived** — not manually entered. Recomputed when underlying transactions change.
2. Can be viewed for any historical date.
3. **Day Close** (optional v1, recommended v1.1): Manager marks day as closed; transactions for that date become read-only.

---

### 4.10 Monthly Summary

**Purpose:** Month-level performance for owner review and business decisions.

#### Computed Metrics

| Metric | Source |
|---|---|
| Total Revenue | Σ daily sales |
| Total Purchases | Σ daily purchases |
| Total Expenses | Σ daily expenses |
| Total Wastage | Σ daily wastage cost |
| Total COGS | Σ daily COGS |
| Gross Profit | Revenue − COGS |
| Net Profit | Gross Profit − Expenses − Wastage |
| Average Daily Sales | Revenue / operating days |
| Best Selling Products | Top N by revenue and quantity |
| Highest Wastage Items | Top N by cost |
| Purchase vs Production Ratio | Indicator of over/under buying |
| Daily trend chart | Revenue, profit, production per day |

#### Business Rules

1. Month boundaries use **organization timezone** and calendar month.
2. Monthly Summary is read-only aggregation.
3. Export to PDF/Excel in Phase 2.

---

### 4.11 Management Dashboard

**Purpose:** At-a-glance command center for owners and managers — **today-first**, with monthly context.

#### Widgets (Today)

| Widget | Data |
|---|---|
| Today's Sales | Revenue + vs yesterday % |
| Today's Production | Total units produced |
| Today's Expenses | Total + top category |
| Today's Purchases | Total amount |
| Today's Net Profit | From daily summary |
| Low Stock Alerts | Count + top 5 items |
| Wastage Today | Cost + count |
| Best Sellers Today | Top 5 products |
| Production vs Sales | Quick gap indicator |
| Quick Actions | Add sale, add production, add purchase |

#### Widgets (Monthly Context)

| Widget | Data |
|---|---|
| MTD Revenue | With target progress bar (target config Phase 2) |
| MTD Net Profit | |
| Sales Trend | Line chart — last 30 days |
| Category Mix | Pie chart — sales by product category |

#### Business Rules

1. Dashboard loads in < 2 seconds for typical data volumes (single bakery, 1 year history).
2. All figures drill down to underlying module filtered by date.
3. Role-based: production staff see production-relevant widgets only.

---

## 5. Cross-Module Workflows

### 5.1 New Organization Setup

```
1. Owner registers → creates Organization
2. Configure org settings (name, currency, timezone, fiscal year start)
3. Add Raw Materials (or import)
4. Set opening stock (stock adjustment)
5. Add Products
6. Create Recipes
7. Begin daily operations
```

### 5.2 Typical Daily Operations

```
Morning:
  → Review low stock alerts
  → Record purchases (if delivery arrived)
  → Record production

Day:
  → Record sales (ongoing)

Evening:
  → Record wastage
  → Record expenses
  → Review Daily Summary
  → (Optional) Close day
```

### 5.3 End-of-Month

```
→ Review Monthly Summary
→ Analyze best sellers and wastage
→ Adjust reorder levels
→ Review product pricing vs recipe cost (margin analysis)
```

---

## 6. Financial & Calculation Standards

### 6.1 Currency & Precision

- **Assumption:** Single currency per organization (default **INR** — configurable).
- Store monetary values as **integer minor units** (paise/cents) in the database to avoid floating-point errors.
- Display with 2 decimal places in UI.

### 6.2 Profit Definition

```
Gross Profit = Total Sales Revenue − Cost of Goods Sold (COGS)
Net Profit   = Gross Profit − Operating Expenses − Wastage Cost
```

**Note:** Purchases are **not** directly subtracted from profit — they affect profit indirectly through COGS when materials are consumed in production and sold.

### 6.3 Cost of Goods Sold (COGS)

For each sales line:

```
COGS = quantitySold × productWeightedAverageCostAtTimeOfSale
```

Product WAC is updated when production adds inventory at recipe-derived unit cost.

### 6.4 Tax (GST/VAT)

**Assumption:** Tax handling is **out of scope for v1** unless owner specifies otherwise. Sales amounts are treated as tax-inclusive or tax-exclusive based on org setting (default: tax-inclusive, no breakdown).

---

## 7. Reporting & Analytics Requirements

| Report | Frequency | Audience |
|---|---|---|
| Daily Summary | Daily | Manager, Owner |
| Monthly Summary | Monthly | Owner |
| Inventory Status | Real-time | Manager |
| Low Stock | Real-time | Manager, Owner |
| Product Performance | Daily/Monthly | Owner |
| Wastage Analysis | Weekly/Monthly | Manager, Owner |
| Material Consumption vs Purchase | Monthly | Owner |

---

## 8. Operational Policies

### 8.1 Date & Timezone

- Each organization has a configured **IANA timezone** (default: `Asia/Kolkata`).
- "Today" is determined by org timezone, not user device timezone.
- Transaction dates cannot be more than **7 days in the future** or more than **90 days in the past** without manager override (configurable).

### 8.2 Day Close (Recommended)

| State | Behavior |
|---|---|
| Open day | Transactions can be created, edited, deleted |
| Closed day | Transactions are read-only; only Owner can reopen |

**v1 default:** Days are open unless day close is explicitly enabled in org settings.

### 8.3 Audit Trail

All create, update, delete operations on transactional data must record:

- `createdAt`, `createdBy`
- `updatedAt`, `updatedBy`
- `deletedAt`, `deletedBy` (soft delete)

Inventory movements are **append-only** — never update or delete; reversals create compensating movements.

### 8.4 Soft Delete

Master data (products, raw materials, recipes) uses soft delete. Transactional records use soft delete with reversal movements where applicable.

---

## 9. Multi-Tenancy & Data Isolation

- Every Firestore document (except global config) belongs to exactly one `organizationId`.
- Users belong to one organization in v1.
- **No cross-org data access** — enforced at security rules and application layer.
- Organization slug used for optional subdomain routing in Phase 2 (`acme.7daysbakery.app`).

---

## 10. Phase 2 Backlog (Not in Initial Scope)

Documented to inform data model design — **do not implement without approval:**

- Multi-location / branch support
- Supplier master & accounts payable
- Customer master & accounts receivable
- Recurring expenses
- Production planning / forecasting
- POS integration
- Barcode scanning
- Tax (GST) line-item breakdown
- Payroll module
- Export PDF/Excel
- Mobile native app
- SMS/WhatsApp alerts for low stock

---

## 11. Open Questions for Product Owner

Resolve before or during Module 1 implementation:

| # | Question | Default if Unanswered |
|---|---|---|
| 1 | Currency and locale? | INR, en-IN |
| 2 | Tax-inclusive or exclusive pricing? | Tax-inclusive, no tax breakdown |
| 3 | Block or warn on insufficient stock for production/sales? | Warn |
| 4 | Is day close required in v1? | Optional, disabled by default |
| 5 | Recipe yield: per single unit or batch? | Batch with yield quantity |
| 6 | Are semi-finished goods (dough, base) tracked? | No — only raw materials and finished products in v1 |
| 7 | Excel workbook available for logic validation? | Owner to provide per module |
| 8 | Maximum expected products / materials per bakery? | ~200 products, ~100 raw materials |
| 9 | Offline / spotty internet support needed? | Online-first; offline Phase 2 |
| 10 | Roles fixed or customizable per org? | Fixed roles in v1 |

---

## 12. Glossary

| Term | Definition |
|---|---|
| **BOM** | Bill of Materials — same as Recipe |
| **COGS** | Cost of Goods Sold |
| **WAC** | Weighted Average Cost |
| **Finished Product** | Item sold to customers |
| **Raw Material** | Ingredient or supply purchased and consumed |
| **Movement** | Single inventory ledger entry |
| **Org / Tenant** | One bakery business account |
| **Day Close** | Locking a calendar day's transactions |
| **MTD** | Month to Date |

---

*This document is authoritative for business behavior. Technical implementation details are in `.docs/DATABASE.md`, `.docs/TECH_STACK.md`, and `.docs/RULES.md`.*
