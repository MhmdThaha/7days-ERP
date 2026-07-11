# 08 — Development Roadmap

> **Document purpose:** Milestone-based implementation plan from Foundation through Dashboard, with deliverables, gate criteria, and owner approval checkpoints.

**Version:** 1.0  
**Last updated:** 2026-07-07  
**Status:** Draft — pending owner approval

**Related:** [02-feature-dependencies.md](./02-feature-dependencies.md) · [features/](../features/) · [RULES.md](../RULES.md)

---

## 1. Roadmap Overview

```
M0 Foundation ──▶ M1 Masters ──▶ M2 Transactions ──▶ M3 Derived ──▶ M4 Dashboard
   (2 weeks)        (2 weeks)        (4 weeks)          (2 weeks)      (1 week)
                                                                      ─────────
                                                        Total: ~11 weeks
```

**Note:** Timelines are estimates for a single developer/AI session workflow with owner review between modules. Adjust based on team size and review cycles.

**Critical rule:** No milestone begins until previous milestone gate criteria pass and owner approves.

---

## 2. Milestone 0 — Foundation

**Goal:** Runnable application with auth, org setup, layout shell, and shared infrastructure. No business modules.

### 2.1 Deliverables

| # | Deliverable | Location |
|---|---|---|
| 0.1 | Next.js 15 project scaffold (App Router, TypeScript strict) | Root |
| 0.2 | Tailwind CSS 4 + shadcn/ui init | `globals.css`, `components/ui/` |
| 0.3 | Firebase project configured (Auth, Firestore, Storage) | Firebase console |
| 0.4 | Environment variables documented | `.env.example` |
| 0.5 | Firebase client + admin SDK init | `lib/firebase/` |
| 0.6 | Auth: register (creates org + owner member) | `actions/auth/`, `components/auth/` |
| 0.7 | Auth: login, logout, session cookie | `api/auth/session/` |
| 0.8 | Middleware route protection | `middleware.ts` |
| 0.9 | Dashboard layout shell (sidebar, top bar) | `components/layout/` |
| 0.10 | TanStack Query + Auth providers | `providers/` |
| 0.11 | Shared utilities: money, dates, cn | `lib/utils/`, `lib/domain/calculations/money.ts` |
| 0.12 | Domain errors + permissions scaffold | `lib/domain/errors.ts`, `permissions.ts` |
| 0.13 | Org settings defaults on register | `settings/config` document |
| 0.14 | Onboarding wizard (basic — settings step) | `/onboarding` |
| 0.15 | Settings page (org name, timezone, currency) | `/settings` |
| 0.16 | Firestore rules: users, orgs, members, settings | `firebase/firestore.rules` |
| 0.17 | Shared components: PageHeader, EmptyState, Skeletons, MoneyDisplay, MoneyInput, ConfirmDialog | `components/shared/` |
| 0.18 | Placeholder dashboard page ("Setup your bakery") | `/` |
| 0.19 | Vercel deployment pipeline | Vercel project |
| 0.20 | ESLint + TypeScript strict passing | CI |

### 2.2 Gate Criteria (Owner Sign-Off Required)

- [ ] User can register, creating org and owner role
- [ ] User can login/logout; session persists on refresh
- [ ] Unauthenticated users redirected to `/login`
- [ ] Dashboard layout renders with sidebar navigation (placeholder items OK)
- [ ] Settings page saves org timezone and currency
- [ ] App deploys to Vercel preview URL
- [ ] No TypeScript errors; no `any` types
- [ ] `.env.example` complete

### 2.3 Out of Scope for M0

- Business entity CRUD
- Inventory service
- Charts
- Member invite (Phase 2 — owner manually creates via Firebase console if needed)

---

## 3. Milestone 1 — Master Data

**Goal:** Product catalog, raw materials, and recipes fully functional.

### 3.1 Module 01 — Product Master (~1 week)

| # | Deliverable |
|---|---|
| 1.1 | Product domain types + Zod schemas |
| 1.2 | product.repository + product.service |
| 1.3 | Server Actions: create, update, deactivate, delete |
| 1.4 | Pages: list, new, detail/edit |
| 1.5 | ProductForm, ProductFilters, ProductImageUpload |
| 1.6 | ProductCombobox (reusable) |
| 1.7 | DataTable integration |
| 1.8 | Firestore rules + indexes for products |
| 1.9 | Storage rules for product images |
| 1.10 | useProducts, useProduct hooks |
| 1.11 | Role-based UI (staff read-only) |

**Gate:** [features/01-product-master.md](../features/01-product-master.md) acceptance criteria pass.

### 3.2 Module 02 — Recipe + Raw Material Master (~1 week)

| # | Deliverable |
|---|---|
| 2.1 | Raw material types, schemas, repo, service, actions, pages |
| 2.2 | Recipe types, schemas, repo, service (versioning), actions, pages |
| 2.3 | RecipeForm with ingredient rows + live cost calculation |
| 2.4 | MaterialCombobox (reusable) |
| 2.5 | Recipe version history view |
| 2.6 | Link activeRecipeId on product |
| 2.7 | Firestore rules + indexes |
| 2.8 | Unit tests: recipe-cost, recipe-scaling calculations |

**Gate:** [features/02-recipe-master.md](../features/02-recipe-master.md) acceptance criteria pass.

### 3.3 Milestone 1 Combined Gate

- [ ] Products CRUD with images
- [ ] Raw materials CRUD with reorder levels
- [ ] Recipes with versioning and cost display
- [ ] ProductCombobox and MaterialCombobox reusable
- [ ] Nav items: Products, Raw Materials, Recipes active
- [ ] Owner approval

---

## 4. Milestone 2 — Transactions

**Goal:** All daily operational recording with inventory integrity.

### 4.1 Module 03 — Purchases + Inventory Service (~1 week)

**Critical infrastructure milestone.**

| # | Deliverable |
|---|---|
| 3.1 | **inventory.repository** (balances + movements) |
| 3.2 | **inventory.service** (recordPurchaseIn, WAC) |
| 3.3 | **calculations/wac.ts** + unit tests |
| 3.4 | **dailySummary.service** (purchase totals only) |
| 3.5 | purchase.repository + purchase.service |
| 3.6 | Purchase pages + line-item form |
| 3.7 | LineItemsContainer shared pattern |
| 3.8 | Integration test: purchase → movement → balance → WAC |
| 3.9 | Firestore rules: purchases, inventory (write blocked) |

**Gate:** Purchase save creates correct movements; WAC verified with test cases.

### 4.2 Module 04 — Production (~1 week)

| # | Deliverable |
|---|---|
| 4.1 | production.service (recipe snapshot, raw OUT, finished IN) |
| 4.2 | Expand inventory.service: recordProduction |
| 4.3 | Expand dailySummary: production metrics |
| 4.4 | Production pages + material preview |
| 4.5 | Insufficient stock warning |
| 4.6 | Integration test: production → dual movements |

**Gate:** [features/04-production.md](../features/04-production.md) acceptance criteria pass.

### 4.3 Module 05 — Sales (~1 week)

| # | Deliverable |
|---|---|
| 5.1 | sales.service (COGS, stock deduction) |
| 5.2 | Expand inventory.service: recordSaleOut |
| 5.3 | Expand dailySummary: sales, COGS, gross profit |
| 5.4 | Sales pages (speed-optimized form) |
| 5.5 | Session storage for last channel/payment |

**Gate:** [features/05-sales.md](../features/05-sales.md) acceptance criteria pass.

### 4.4 Module 06 — Expenses (~3 days)

| # | Deliverable |
|---|---|
| 6.1 | expense.service + storage upload for receipts |
| 6.2 | Expand dailySummary: expenses by category |
| 6.3 | Expense pages (simple form) |

**Gate:** [features/06-expenses.md](../features/06-expenses.md) acceptance criteria pass.

### 4.5 Module 07 — Wastage (~3 days)

| # | Deliverable |
|---|---|
| 7.1 | wastage.service |
| 7.2 | Expand inventory.service: recordWastageOut |
| 7.3 | Expand dailySummary: wastage cost, net profit (complete) |
| 7.4 | Wastage pages |

**Gate:** [features/07-wastage.md](../features/07-wastage.md) acceptance criteria pass.

### 4.6 Milestone 2 Combined Gate

- [ ] All 5 transaction types create correct inventory movements
- [ ] Edit/delete reverses movements atomically
- [ ] Daily summary doc updates correctly for all transaction types
- [ ] Net profit formula verified: grossProfit − expenses − wastage
- [ ] Role restrictions enforced on all modules
- [ ] Owner approval

---

## 5. Milestone 3 — Derived Views

**Goal:** Inventory visibility, daily and monthly reporting.

### 5.1 Module 08 — Inventory UI (~1 week)

| # | Deliverable |
|---|---|
| 8.1 | Inventory balance pages (raw/finished tabs) |
| 8.2 | Movement ledger page |
| 8.3 | Low stock page + badge on nav |
| 8.4 | Stock adjustment form (admin) |
| 8.5 | Item detail with movement history |
| 8.6 | inventory.service: recordAdjustment |

**Gate:** [features/08-inventory.md](../features/08-inventory.md) acceptance criteria pass.

### 5.2 Module 09 — Daily Summary (~4 days)

| # | Deliverable |
|---|---|
| 9.1 | Daily Summary page with KPI grid |
| 9.2 | Product performance table |
| 9.3 | Expense category chart |
| 9.4 | Day close / reopen (owner) |
| 9.5 | Date navigator + drill-down links |
| 9.6 | Closed day enforcement in transaction services |

**Gate:** [features/09-daily-summary.md](../features/09-daily-summary.md) acceptance criteria pass.

### 5.3 Module 10 — Monthly Summary (~4 days)

| # | Deliverable |
|---|---|
| 10.1 | monthlySummary.service (aggregate from daily docs) |
| 10.2 | Monthly Summary page |
| 10.3 | Daily trend chart (Recharts) |
| 10.4 | Best sellers + wastage ranking tables |
| 10.5 | Month navigator |

**Gate:** [features/10-monthly-summary.md](../features/10-monthly-summary.md) acceptance criteria pass.

### 5.4 Milestone 3 Combined Gate

- [ ] Inventory balances match movement ledger
- [ ] Daily summary KPIs match manual verification
- [ ] Monthly totals = sum of daily summaries
- [ ] Day close blocks edits across all transaction modules
- [ ] Owner approval

---

## 6. Milestone 4 — Management Dashboard

**Goal:** Production-ready command center — final module.

### 6.1 Module 11 — Dashboard (~1 week)

| # | Deliverable |
|---|---|
| 11.1 | Replace placeholder `/` with full dashboard |
| 11.2 | Today KPI row with yesterday comparison |
| 11.3 | MTD widgets |
| 11.4 | 30-day sales trend chart (dynamic import) |
| 11.5 | Category mix chart |
| 11.6 | Low stock widget |
| 11.7 | Best sellers + wastage widgets |
| 11.8 | Quick actions bar |
| 11.9 | Role-filtered widget visibility |
| 11.10 | Setup incomplete banner |
| 11.11 | All KPI drill-down links |
| 11.12 | Performance: load < 2 seconds |

**Gate:** [features/11-dashboard.md](../features/11-dashboard.md) acceptance criteria pass.

### 6.2 Milestone 4 / Project Gate

- [ ] Dashboard is default landing after login
- [ ] All widgets match source module data
- [ ] Role-based dashboard filtering works
- [ ] Full manual test plan executed across all modules
- [ ] Firestore rules complete and deployed
- [ ] All indexes deployed
- [ ] Production deployment on Vercel
- [ ] **Owner final approval — v1 complete**

---

## 7. Milestone Dependency Graph

```
M0 (Foundation)
 │
 ├──▶ M1.1 (Products)
 │       │
 │       └──▶ M1.2 (Recipes + Raw Materials)
 │               │
 │               └──▶ M2.1 (Purchases + Inventory Service) ★
 │                       │
 │                       ├──▶ M2.2 (Production)
 │                       │       │
 │                       │       └──▶ M2.3 (Sales)
 │                       │               │
 │                       │               ├──▶ M2.4 (Expenses) ──┐
 │                       │               │                     ├── (parallel OK)
 │                       │               └──▶ M2.5 (Wastage) ──┘
 │                       │
 │                       └──▶ M3.1 (Inventory UI)
 │                               │
 │                               ├──▶ M3.2 (Daily Summary)
 │                               │       │
 │                               │       └──▶ M3.3 (Monthly Summary)
 │                               │               │
 │                               │               └──▶ M4 (Dashboard)
```

---

## 8. Owner Approval Checkpoints

| Checkpoint | After | Owner Action |
|---|---|---|
| CP-0 | M0 Foundation | Approve scaffold; confirm Firebase project |
| CP-1 | M1 Masters | Validate product/recipe workflow vs Excel |
| CP-2 | M2.1 Purchases | Verify WAC calculation vs Excel |
| CP-3 | M2 Transactions | Validate full daily workflow vs Excel |
| CP-4 | M3 Derived | Validate daily/monthly profit vs Excel |
| CP-5 | M4 Dashboard | Final v1 acceptance |

**No coding on next module until checkpoint approved.**

---

## 9. Testing Milestones

| Milestone | Testing Required |
|---|---|
| M0 | Auth flow manual test |
| M1 | Product/recipe CRUD manual test |
| M2.1 | WAC unit tests + purchase integration test |
| M2.2 | Recipe scaling unit tests + production integration test |
| M2.3 | COGS unit tests + sales integration test |
| M2 | Full transaction cycle manual test |
| M3 | Summary aggregation unit tests |
| M4 | Dashboard data accuracy manual test |
| Final | Full regression test plan |

---

## 10. Documentation Updates Per Milestone

| Milestone | Docs to Update |
|---|---|
| Each module | Confirm feature spec matches implementation |
| M2.1 | DATABASE.md if schema adjustments |
| M3 | Verify summary field list in DATABASE.md |
| M4 | README.md with setup instructions |
| Final | Mark all docs Status: Approved |

---

## 11. Risk Mitigation Timeline

| Week | Risk | Mitigation |
|---|---|---|
| M0 | Firebase config errors | Test auth flow first before UI |
| M2.1 | WAC bugs corrupt all costing | Unit tests before UI; manual Excel comparison |
| M2 | Transaction race conditions | Firestore transactions; integration tests |
| M3 | Summary performance | Materialized docs from M2.1 — never compute on read |
| M4 | Dashboard slow | Parallel queries; dynamic chart imports |

---

## 12. Post-v1 Backlog (Not in Roadmap)

Prioritized for future milestones after v1 owner approval:

| Priority | Feature |
|---|---|
| P1 | Member invite flow |
| P1 | Export PDF/Excel reports |
| P1 | Sales returns / credit notes |
| P2 | Supplier master |
| P2 | POS-optimized sales mode |
| P2 | Barcode scanning |
| P2 | Google OAuth |
| P3 | Multi-location support |
| P3 | GST tax breakdown |
| P3 | Mobile native app |

---

## 13. Definition of Done (Project v1)

The project v1 is **complete** when:

1. All 11 business modules pass acceptance criteria
2. All milestone gate criteria checked
3. All owner checkpoints approved
4. Firestore rules and indexes deployed to production Firebase
5. Application deployed on Vercel production
6. No P0 bugs open
7. Domain calculation unit tests passing in CI
8. README documents local setup and deployment
9. No `any` types in codebase
10. Excel workbook validation signed off by owner for profit/inventory logic

---

## 14. Recommended First Session After Approval

When owner approves this architecture:

```
Session 1: Milestone 0 — Foundation
  → Read: .docs/architecture/*, .docs/RULES.md
  → Scaffold Next.js project
  → Configure Firebase
  → Implement auth + session
  → Build layout shell
  → Deploy to Vercel
  → STOP — request CP-0 approval
```

---

*This roadmap is the implementation sequence authority. Module order may not be changed without architectural review and owner approval.*
