# 02 — Feature Dependencies

> **Document purpose:** Module dependency graph, build order, shared infrastructure requirements, and coupling rules. Prevents out-of-order implementation that breaks the system.

**Version:** 1.0  
**Last updated:** 2026-07-07  
**Status:** Draft — pending owner approval

**Related:** [RULES.md](../RULES.md) · [features/](../features/) · [04-firestore-services.md](./04-firestore-services.md)

---

## 1. Dependency Overview

```
                    ┌─────────────────┐
                    │  Phase 0        │
                    │  Foundation     │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐  ┌────────────┐  ┌──────────┐
        │ Product  │  │ Raw Mat.   │  │ Settings │
        │ Master   │  │ (w/ Recipe)│  │ / Org    │
        └────┬─────┘  └─────┬──────┘  └────┬─────┘
             │              │              │
             └──────┬───────┘              │
                    ▼                      │
              ┌──────────┐                 │
              │  Recipe  │◄────────────────┘
              │  Master  │
              └────┬─────┘
                   │
     ┌─────────────┼─────────────────────────────┐
     ▼             ▼                             │
┌──────────┐  ┌──────────────────────────────────┤
│Purchases │  │ Inventory Service (balances +    │
│          │──│ movements) — BUILT HERE          │
└────┬─────┘  └──────────────────────────────────┘
     │
     ├──────────────┬──────────────┬──────────────┐
     ▼              ▼              ▼              ▼
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│Production│  │  Sales   │  │ Expenses │  │ Wastage  │
└────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘
     │              │              │              │
     └──────────────┴──────┬───────┴──────────────┘
                           ▼
                    ┌──────────────┐
                    │ Daily Summary│◄─── recalc on every transaction
                    │   Service    │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
       ┌──────────┐ ┌───────────┐ ┌──────────┐
       │Inventory │ │  Monthly  │ │Dashboard │
       │   UI     │ │  Summary  │ │          │
       └──────────┘ └───────────┘ └──────────┘
```

---

## 2. Phase 0 — Foundation (No Business Module)

**Must exist before any business module.**

| Deliverable | Required By |
|---|---|
| Next.js scaffold + TypeScript strict | Everything |
| Firebase project + env config | Everything |
| Auth (register, login, session) | Everything |
| Organization creation on signup | Everything |
| Member document + role assignment | RBAC on all modules |
| Dashboard layout shell (sidebar, top bar) | All module UIs |
| `lib/utils/money.ts`, `dates.ts` | All financial modules |
| `lib/domain/errors.ts`, `permissions.ts` | All modules |
| Firestore security rules skeleton | All modules |
| shadcn/ui base components | All module UIs |
| TanStack Query provider | All list/detail pages |

**Does not require:** Any business entity repositories.

---

## 3. Module Dependency Matrix

**Legend:** `→` = depends on | `⇢` = partially depends (read-only or service layer)

| Module | Depends On | Provides To |
|---|---|---|
| **01 Product Master** | Phase 0, Org Settings (categories, units) | Recipes, Production, Sales, Inventory, Summaries, Dashboard |
| **02 Recipe Master** | Product Master, Raw Materials (same module), Org Settings | Production, Recipe cost display |
| **02 Raw Materials** | Phase 0, Org Settings | Recipes, Purchases, Production, Wastage, Inventory |
| **03 Purchases** | Raw Materials, **Inventory Service** | Inventory UI, Daily Summary, Dashboard |
| **04 Production** | Products, Recipes, Inventory Service | Inventory UI, Daily Summary, Dashboard |
| **05 Sales** | Products, Inventory Service | Daily Summary, Dashboard |
| **06 Expenses** | Phase 0, Org Settings (categories) | Daily Summary, Dashboard |
| **07 Wastage** | Products, Raw Materials, Inventory Service | Daily Summary, Dashboard |
| **08 Inventory UI** | Purchases, Production, Sales, Wastage (all writers) | Dashboard (low stock) |
| **09 Daily Summary** | All transaction modules (03–07) | Monthly Summary, Dashboard |
| **10 Monthly Summary** | Daily Summary service + docs | Dashboard (MTD) |
| **11 Dashboard** | Daily Summary, Monthly Summary, Inventory balances | — (terminal) |

---

## 4. Infrastructure Dependencies (Cross-Cutting)

These are **not business modules** but must be built at specific points:

### 4.1 Inventory Service (Critical Path)

| Component | Built In | Used By |
|---|---|---|
| `inventory.repository.ts` | Phase 0 scaffold + **Module 03** | Purchases, Production, Sales, Wastage, Adjustments |
| `inventory.service.ts` | **Module 03** | All inventory writers |
| `lib/domain/calculations/wac.ts` | **Module 03** | Purchases, Production |
| Movement types enum | **Module 03** | All writers |
| Balance document schema | **Module 03** | All modules showing stock |

**Rule:** Do not implement Production (04) until Purchase (03) inventory transactions are tested and verified.

### 4.2 Daily Summary Service (Critical Path)

| Component | Built In | Used By |
|---|---|---|
| `daily-summary.repository.ts` | **Module 03** (basic) | All transaction modules |
| `daily-summary.service.ts` | **Module 03** (purchase totals only) | Expanded in each subsequent module |
| `lib/domain/calculations/summary-aggregation.ts` | **Module 03** | Modules 03–07 incrementally |
| `dailySummaries/{date}` document | **Module 03** | Dashboard, Monthly Summary |

**Incremental build:**

```
Module 03 → daily summary includes: totalPurchases
Module 04 → adds: totalProductionUnits, totalProductionCost
Module 05 → adds: sales, COGS, grossProfit
Module 06 → adds: totalExpenses, expensesByCategory
Module 07 → adds: totalWastageCost, netProfit
Module 09 → full UI + day close
```

### 4.3 Monthly Summary Service

| Component | Built In | Used By |
|---|---|---|
| `monthly-summary.service.ts` | **Module 09** or **10** | Dashboard MTD widgets |
| `monthlySummaries/{month}` document | **Module 09** or **10** | Dashboard, Monthly Summary UI |

**Recommendation:** Implement recalculation hook in Module 09; build Monthly Summary UI in Module 10.

### 4.4 Shared Pickers (UI Dependencies)

| Component | Built In | Used By |
|---|---|---|
| `ProductCombobox` | **Module 01** | Production, Sales |
| `MaterialCombobox` | **Module 02** | Recipes, Purchases, Wastage |
| `LineItemTable` pattern | **Module 03** | Production, Sales |
| `MoneyInput`, `MoneyDisplay` | **Phase 0** | All financial modules |

---

## 5. Data Entity Dependencies

```
Organization
    └── Settings (categories, units, channels)
    └── Members (roles)

RawMaterial ──────────────────────────┐
    ▲                                 │
    │ used in                         │
Recipe ─── linked to ──► Product      │
    ▲                                 │
    │ required by                     │
Production ─── consumes ──────────────┘
    │
    └── produces ──► Product (finished stock)

Purchase ─── increases ──► RawMaterial stock

Sales ─── decreases ──► Product stock

Wastage ─── decreases ──► RawMaterial OR Product stock

Expense ─── (no inventory link) ──► Daily Summary only

All inventory writers ──► InventoryMovement (ledger)
                       ──► InventoryBalance (snapshot)
                       ──► DailySummary (aggregates)
```

---

## 6. Strict Build Order

| Order | Module | Gate Criteria (must pass before next) |
|---|---|---|
| 0 | Foundation | Auth works; org created; layout renders; deploys to Vercel |
| 1 | Product Master | CRUD complete; combobox reusable; security rules deployed |
| 2 | Recipe + Raw Materials | Recipe versioning works; cost calculation verified |
| 3 | Purchases + Inventory Service | WAC test cases pass; movements append-only; daily summary purchase total correct |
| 4 | Production | Recipe snapshot stored; raw OUT + finished IN verified |
| 5 | Sales | COGS calculated; stock deduction verified |
| 6 | Expenses | Summary expense totals correct; no inventory side effects |
| 7 | Wastage | WASTAGE_OUT movements correct |
| 8 | Inventory UI | Balances match movement ledger; low stock query works |
| 9 | Daily Summary UI | All KPIs match manual calc; day close works |
| 10 | Monthly Summary UI | Monthly totals = sum of dailies |
| 11 | Dashboard | All widgets match source modules; role filtering works |

---

## 7. Coupling Rules

### 7.1 Allowed Dependencies

| From | To | Type |
|---|---|---|
| Transaction module service | `inventory.service` | Service call |
| Transaction module service | `daily-summary.service` | Recalc trigger |
| Any module UI | Shared pickers | Component import |
| Dashboard | Summary repositories | Read only |
| Recipe service | `raw-material.repository` (read WAC) | Read |

### 7.2 Forbidden Dependencies

| From | To | Reason |
|---|---|---|
| Product service | Sales service | Creates circular coupling — use repository read |
| UI component | Any service | Must go through hooks/actions |
| Repository | Service | Wrong direction — repos are data layer only |
| Module A repository | Module B repository directly | Cross-module writes go through orchestrating service |
| Daily Summary UI | Raw transaction repositories | Must read summary doc only (performance) |
| Client component | Firebase Admin SDK | Server only |

### 7.3 Cross-Module Read Pattern

When Module B needs data from Module A (e.g., Sales needs product price):

```
Sales Service → Product Repository (read by id)
              ✗ Sales Service → Product Service (avoid unless business rule)
```

Use the **repository** for simple reads; use the **service** when business rules apply (e.g., recipe cost calculation).

---

## 8. Parallel Work Opportunities

These can be developed in parallel **after** their shared dependency is complete:

| Parallel Track A | Parallel Track B | Shared Prerequisite |
|---|---|---|
| Expenses (06) | Wastage (07) | Inventory service + daily summary base (after 05) |
| Inventory UI (08) | Daily Summary UI (09) | All transaction modules (03–07) complete |
| Product images (Storage) | Expense receipts (Storage) | Phase 0 Firebase Storage config |

**Never parallelize:** Purchases and Production (sequential — inventory logic builds incrementally).

---

## 9. Feature Flag / Org Settings Dependencies

| Setting | Location | Affects Modules |
|---|---|---|
| `dayCloseEnabled` | Org settings | 03–07, 09 |
| `blockSaleOnInsufficientStock` | Org settings | 05 |
| `blockProductionOnInsufficientStock` | Org settings | 04 |
| Product categories | Org settings | 01, Dashboard category mix |
| Expense categories | Org settings | 06, 09 |
| Sales channels | Org settings | 05 |
| Wastage reasons | Org settings | 07 |

Settings module (Phase 0 minimal + expand in Module 01) must exist before masters.

---

## 10. Firestore Index Dependencies

Deploy indexes **before** querying — add to `firebase/firestore.indexes.json` when implementing:

| Module | Indexes Added |
|---|---|
| 01 Products | `(orgId, isActive, name)`, `(orgId, category, name)` |
| 02 Recipes | `(orgId, productId, isActive)` |
| 03 Purchases | `(orgId, purchaseDate DESC)` |
| 04 Production | `(orgId, productionDate DESC)` |
| 05 Sales | `(orgId, salesDate DESC)`, `(orgId, salesDate, channel)` |
| 06 Expenses | `(orgId, expenseDate DESC)`, `(orgId, expenseDate, category)` |
| 07 Wastage | `(orgId, wastageDate DESC)` |
| 08 Inventory | `(orgId, isLowStock, itemName)`, `(orgId, itemId, createdAt DESC)` on movements |
| 09 Daily Summary | `(orgId, summaryDate DESC)` |
| 11 Dashboard | Uses indexes from 08, 09 |

---

## 11. Security Rules Rollout

Security rules updated incrementally per module:

| Phase | Rules Added |
|---|---|
| 0 | Users, organizations, members |
| 1 | products |
| 2 | rawMaterials, recipes |
| 3–7 | purchases, production, sales, expenses, wastage |
| 3 | inventory balances (read) + movements (read); writes blocked (Admin SDK) |
| 9 | dailySummaries, monthlySummaries (read only) |

---

## 12. Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Implementing Sales before Inventory service | Data corruption | Enforce Module 03 gate |
| Skipping recipe snapshot on production | Incorrect historical COGS | Acceptance criteria in Module 04 |
| Client-side inventory writes | Security vulnerability | Admin SDK + rules `allow write: if false` |
| Daily summary computed on read | Dashboard slow at scale | Materialized docs from Module 03 |
| Circular service dependencies | Unmaintainable code | Repository read pattern (Section 7.3) |
| Building all module folders upfront | Confusion, dead code | Add folders per module only |

---

*Refer to [08-development-roadmap.md](./08-development-roadmap.md) for milestone timelines and deliverable checklists per phase.*
