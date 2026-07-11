# 01 — Project Structure

> **Document purpose:** Canonical folder layout and file organization for the 7Days Bakery ERP Next.js application. All scaffolding and new code must follow this structure.

**Version:** 1.0  
**Last updated:** 2026-07-07  
**Status:** Draft — pending owner approval

**Related:** [TECH_STACK.md](../TECH_STACK.md) · [RULES.md](../RULES.md) · [02-feature-dependencies.md](./02-feature-dependencies.md)

---

## 1. Architectural Principles

| Principle | Implementation |
|---|---|
| **Feature colocation** | Module-specific UI lives under `components/{module}/`; shared UI under `components/shared/` |
| **Layer separation** | UI → Application (hooks/actions) → Domain/Services → Repositories — no layer skipping |
| **Server-first** | Default to React Server Components; client islands only where needed |
| **Domain-centric** | Business logic never in components; calculations in `lib/domain/calculations/` |
| **Multi-tenant by design** | Every repository method accepts `organizationId` as first parameter |
| **Strict TypeScript** | No `any`; branded ID types; Zod schemas as runtime contract |
| **Testability** | Pure functions and services are unit-testable without React or Firestore |

---

## 2. Repository Root Layout

```
7daysBakeryErp/
├── .docs/                              # Project documentation (never imported by app)
│   ├── architecture/                   # This folder
│   ├── features/                       # Per-module feature specs
│   ├── BUSINESS.md
│   ├── DATABASE.md
│   ├── RULES.md
│   ├── TECH_STACK.md
│   └── UI_GUIDELINES.md
│
├── firebase/                           # Firebase config (deployed separately)
│   ├── firestore.rules
│   ├── firestore.indexes.json
│   └── storage.rules
│
├── public/
│   ├── favicon.ico
│   └── assets/                         # Static images, icons (not user uploads)
│
├── src/                                # All application source code
│   ├── app/                            # Next.js App Router
│   ├── actions/                        # Server Actions (grouped by domain)
│   ├── components/                     # React components
│   ├── hooks/                          # Custom React hooks
│   ├── lib/                            # Core libraries (domain, services, firebase)
│   ├── providers/                      # React context providers
│   └── middleware.ts                   # Auth route protection
│
├── .env.example
├── .env.local                          # Gitignored
├── components.json                     # shadcn/ui config
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
├── eslint.config.mjs
├── package.json
└── README.md
```

---

## 3. `src/app/` — App Router Structure

Route groups separate auth flows from the authenticated dashboard shell.

```
src/app/
├── layout.tsx                          # Root layout: html, body, fonts, providers
├── globals.css                         # Tailwind + CSS variables
├── not-found.tsx
├── global-error.tsx
│
├── (auth)/                             # Unauthenticated routes
│   ├── layout.tsx                      # Centered card layout, no sidebar
│   ├── login/
│   │   └── page.tsx
│   ├── register/
│   │   └── page.tsx
│   ├── forgot-password/
│   │   └── page.tsx
│   └── reset-password/
│       └── page.tsx
│
├── (dashboard)/                        # Authenticated routes (sidebar shell)
│   ├── layout.tsx                      # Sidebar + top bar; auth guard
│   ├── loading.tsx                     # Dashboard-level skeleton
│   ├── error.tsx                       # Dashboard error boundary
│   │
│   ├── page.tsx                        # Dashboard (/) — Module 11
│   │
│   ├── products/                       # Module 01
│   │   ├── page.tsx                    # List
│   │   ├── loading.tsx
│   │   ├── new/
│   │   │   └── page.tsx
│   │   └── [id]/
│   │       └── page.tsx
│   │
│   ├── raw-materials/                  # Module 02 (part)
│   │   ├── page.tsx
│   │   ├── new/page.tsx
│   │   └── [id]/page.tsx
│   │
│   ├── recipes/                        # Module 02 (part)
│   │   ├── page.tsx
│   │   ├── new/page.tsx
│   │   └── [id]/page.tsx
│   │
│   ├── purchases/                      # Module 03
│   ├── production/                     # Module 04
│   ├── sales/                          # Module 05
│   ├── expenses/                       # Module 06
│   ├── wastage/                        # Module 07
│   │
│   ├── inventory/                      # Module 08
│   │   ├── page.tsx                    # Balances (tabs)
│   │   ├── movements/page.tsx
│   │   ├── low-stock/page.tsx
│   │   ├── adjustments/new/page.tsx
│   │   └── [itemKey]/page.tsx
│   │
│   ├── daily-summary/                  # Module 09
│   │   └── page.tsx
│   │
│   ├── monthly-summary/                # Module 10
│   │   └── page.tsx
│   │
│   ├── settings/                       # Org settings, members
│   │   ├── page.tsx
│   │   ├── organization/page.tsx
│   │   ├── categories/page.tsx
│   │   └── members/page.tsx
│   │
│   └── onboarding/                     # Post-register wizard (Phase 0)
│       └── page.tsx
│
└── api/                                # External-facing APIs only
    └── auth/
        └── session/
            └── route.ts                # Session cookie exchange
```

### 3.1 Route Conventions

| Pattern | Example | Purpose |
|---|---|---|
| List | `/products` | Paginated list with filters |
| Create | `/products/new` | Create form |
| Detail/Edit | `/products/[id]` | View and edit same page (edit mode toggle or always-editable) |
| Filter via searchParams | `/sales?salesDate=2026-07-07` | Date-scoped views, drill-down from dashboard |

**Decision:** Use `searchParams` for date filters rather than dynamic route segments — simplifies linking from dashboard KPI cards.

---

## 4. `src/actions/` — Server Actions

Server Actions are the **primary mutation path** for all inventory-affecting and privileged operations.

```
src/actions/
├── auth/
│   ├── register.ts                     # Sign up + create org
│   ├── login.ts                        # Session establishment
│   └── logout.ts
│
├── products.ts                         # Module 01
├── raw-materials.ts                    # Module 02
├── recipes.ts                          # Module 02
├── purchases.ts                        # Module 03
├── production.ts                       # Module 04
├── sales.ts                            # Module 05
├── expenses.ts                         # Module 06
├── wastage.ts                          # Module 07
├── inventory.ts                        # Module 08 (adjustments only)
├── summaries.ts                        # Module 09/10 (day close/reopen)
└── settings.ts                         # Org settings, members
```

### 4.1 Server Action Pattern

Each action file exports typed functions that follow this sequence:

```
1. Authenticate session (get current user + orgId)
2. Authorize role (check permission for action)
3. Validate input with Zod schema
4. Call service layer method
5. Return typed ActionResult<T> or throw DomainError
```

**Never** put Firestore calls directly in action files — delegate to services.

---

## 5. `src/components/` — UI Components

```
src/components/
├── ui/                                 # shadcn/ui primitives (generated, do not hand-edit logic)
│   ├── button.tsx
│   ├── input.tsx
│   ├── form.tsx
│   ├── table.tsx
│   ├── sidebar.tsx
│   └── ...
│
├── layout/                             # App shell
│   ├── app-sidebar.tsx
│   ├── top-bar.tsx
│   ├── nav-items.ts                    # Navigation config (single source)
│   ├── breadcrumbs.tsx
│   └── user-menu.tsx
│
├── shared/                             # Cross-module reusable components
│   ├── page-header.tsx
│   ├── data-table/                     # Generic table subsystem
│   │   ├── data-table.tsx
│   │   ├── data-table-pagination.tsx
│   │   ├── data-table-column-header.tsx
│   │   └── data-table-row-actions.tsx
│   ├── forms/
│   │   ├── money-input.tsx
│   │   ├── quantity-input.tsx
│   │   ├── date-picker.tsx
│   │   └── date-range-filter.tsx
│   ├── display/
│   │   ├── money-display.tsx
│   │   ├── status-badge.tsx
│   │   └── stock-indicator.tsx
│   ├── feedback/
│   │   ├── empty-state.tsx
│   │   ├── confirm-dialog.tsx
│   │   └── loading-skeletons/
│   ├── pickers/
│   │   ├── product-combobox.tsx
│   │   └── material-combobox.tsx
│   └── charts/
│       ├── chart-loader.tsx            # Dynamic import wrapper
│       └── metric-card.tsx
│
├── auth/                               # Login, register forms
│   ├── login-form.tsx
│   └── register-form.tsx
│
├── products/                           # Module 01 specific
│   ├── product-form.tsx
│   ├── product-filters.tsx
│   └── product-image-upload.tsx
│
├── recipes/                            # Module 02 specific
├── purchases/                          # Module 03 specific
├── production/                         # Module 04 specific
├── sales/                              # Module 05 specific
├── expenses/                           # Module 06 specific
├── wastage/                            # Module 07 specific
├── inventory/                          # Module 08 specific
├── daily-summary/                      # Module 09 specific
├── monthly-summary/                    # Module 10 specific
└── dashboard/                          # Module 11 specific
```

### 5.1 Component Naming Rules

| Type | Convention | Example |
|---|---|---|
| Page-level client wrapper | `{Module}PageClient` | `ProductsPageClient` |
| Form | `{Entity}Form` | `ProductForm` |
| List filters | `{Entity}Filters` | `ProductFilters` |
| Module table | `{Entity}Table` | `ProductTable` |
| Row (line item) | `{Entity}LineRow` | `SalesLineRow` |

### 5.2 Server vs Client Component Split

```
page.tsx (Server Component)
  └── fetches initial auth context
  └── renders PageClient (Client Component) with orgId prop
        └── uses hooks (TanStack Query)
        └── renders Form / Table components
```

Pages stay thin — orchestration in client wrapper or hooks, not in `page.tsx` logic blocks.

---

## 6. `src/lib/` — Core Library

```
src/lib/
├── domain/
│   ├── types/
│   │   ├── ids.ts                      # Branded types: OrganizationId, ProductId, etc.
│   │   ├── base.ts                     # BaseDocument, AuditFields
│   │   ├── product.ts
│   │   ├── raw-material.ts
│   │   ├── recipe.ts
│   │   ├── purchase.ts
│   │   ├── production.ts
│   │   ├── sales.ts
│   │   ├── expense.ts
│   │   ├── wastage.ts
│   │   ├── inventory.ts
│   │   └── summary.ts
│   │
│   ├── schemas/                        # Zod schemas (mirror types)
│   │   ├── product.schema.ts
│   │   ├── raw-material.schema.ts
│   │   ├── recipe.schema.ts
│   │   ├── purchase.schema.ts
│   │   ├── production.schema.ts
│   │   ├── sales.schema.ts
│   │   ├── expense.schema.ts
│   │   ├── wastage.schema.ts
│   │   ├── inventory.schema.ts
│   │   └── settings.schema.ts
│   │
│   ├── calculations/                   # Pure functions — no side effects
│   │   ├── money.ts                    # parseMoneyInput, formatMoney, addMoney
│   │   ├── wac.ts                      # Weighted average cost
│   │   ├── recipe-cost.ts              # Recipe unit cost from ingredients
│   │   ├── recipe-scaling.ts           # Scale ingredients for production qty
│   │   ├── sales-line.ts               # lineTotal, cogs
│   │   ├── profit.ts                   # grossProfit, netProfit, margin
│   │   └── summary-aggregation.ts      # Daily/monthly rollup logic
│   │
│   ├── permissions.ts                  # RBAC matrix + can(user, action, resource)
│   ├── errors.ts                       # DomainError, ActionResult types
│   └── constants.ts                    # Movement types, roles, defaults
│
├── services/                           # Business workflow orchestration
│   ├── auth.service.ts
│   ├── organization.service.ts
│   ├── product.service.ts
│   ├── raw-material.service.ts
│   ├── recipe.service.ts
│   ├── purchase.service.ts
│   ├── production.service.ts
│   ├── sales.service.ts
│   ├── expense.service.ts
│   ├── wastage.service.ts
│   ├── inventory.service.ts            # Core: movements, balances, WAC
│   ├── daily-summary.service.ts
│   ├── monthly-summary.service.ts
│   └── storage.service.ts              # Firebase Storage uploads
│
├── repositories/                       # Firestore data access only
│   ├── base.repository.ts              # Shared helpers, converters
│   ├── organization.repository.ts
│   ├── member.repository.ts
│   ├── product.repository.ts
│   ├── raw-material.repository.ts
│   ├── recipe.repository.ts
│   ├── purchase.repository.ts
│   ├── production.repository.ts
│   ├── sales.repository.ts
│   ├── expense.repository.ts
│   ├── wastage.repository.ts
│   ├── inventory.repository.ts
│   ├── daily-summary.repository.ts
│   ├── monthly-summary.repository.ts
│   └── settings.repository.ts
│
├── firebase/
│   ├── client.ts                       # Client SDK init (browser)
│   ├── admin.ts                        # Admin SDK init (server only)
│   ├── auth-server.ts                  # Session verification, getCurrentUser
│   ├── converters.ts                   # Firestore Timestamp ↔ domain types
│   └── paths.ts                        # Collection path builders
│
└── utils/
    ├── dates.ts                        # Org timezone, getOrgToday, formatDate
    ├── cn.ts                           # tailwind-merge utility
    ├── pagination.ts                   # Cursor pagination helpers
    └── action-result.ts                # wrapAction, handleActionError
```

---

## 7. `src/hooks/` — Application Hooks

```
src/hooks/
├── use-auth.ts                         # Current user + loading state
├── use-organization.ts                 # Org settings, timezone, currency
├── use-permissions.ts                  # can(action) based on role
│
├── queries/                            # TanStack Query hooks (reads)
│   ├── use-products.ts
│   ├── use-raw-materials.ts
│   ├── use-recipes.ts
│   ├── use-purchases.ts
│   ├── use-production.ts
│   ├── use-sales.ts
│   ├── use-expenses.ts
│   ├── use-wastage.ts
│   ├── use-inventory.ts
│   ├── use-daily-summary.ts
│   ├── use-monthly-summary.ts
│   └── use-dashboard.ts
│
└── mutations/                          # TanStack Query mutation wrappers (optional)
    ├── use-product-mutations.ts
    └── ...
```

**Decision:** Mutations call Server Actions directly from forms; dedicated mutation hooks added only when optimistic updates are needed (Sales module candidate).

---

## 8. `src/providers/` — React Providers

```
src/providers/
├── index.tsx                           # Composes all providers for root layout
├── query-provider.tsx                  # TanStack QueryClientProvider
├── auth-provider.tsx                   # Firebase Auth state listener
├── theme-provider.tsx                  # shadcn theme (optional v1)
└── toast-provider.tsx                  # Sonner Toaster
```

Provider order in root layout:

```
QueryProvider → AuthProvider → ThemeProvider → {children} → ToastProvider
```

---

## 9. Testing Structure

```
src/
├── lib/domain/calculations/
│   ├── wac.test.ts
│   ├── recipe-scaling.test.ts
│   ├── profit.test.ts
│   └── summary-aggregation.test.ts
│
└── lib/services/
    ├── inventory.service.test.ts
    └── daily-summary.service.test.ts
```

**Priority:** Unit test all calculation functions and inventory/summary services before UI integration.

---

## 10. Import Boundaries (Enforced by Convention)

```
components/     → hooks/, lib/domain/types, lib/utils
                ✗ lib/repositories, lib/firebase/admin, lib/services

hooks/          → lib/repositories (read via client SDK wrappers), actions/
                ✗ lib/services (mutations go through actions)

actions/        → lib/services, lib/domain/schemas, lib/firebase/auth-server
                ✗ components/

services/       → lib/repositories, lib/domain/calculations, lib/domain/schemas
                ✗ components/, hooks/

repositories/   → lib/firebase/admin (server) or client.ts (client reads)
                ✗ services/, components/
```

**Lint rule (recommended):** Use ESLint `import/no-restricted-paths` to enforce layer boundaries in CI.

---

## 11. File Size Guidelines

| File type | Max recommended lines | Action if exceeded |
|---|---|---|
| Service | 300 | Extract sub-workflows |
| Repository | 250 | Split by entity |
| Page component | 150 | Extract to module components |
| Form component | 400 | Split field groups into sub-components |
| Calculation module | 200 | Split by concern |

---

## 12. Environment & Config Files

| File | Purpose |
|---|---|
| `next.config.ts` | Image domains (Firebase Storage), headers (CSP) |
| `tsconfig.json` | `strict: true`, paths `@/*` → `./src/*` |
| `components.json` | shadcn/ui configuration |
| `firebase.json` | Firebase deploy config (optional) |
| `.env.example` | Documented env vars without values |

---

## 13. What NOT to Put in `src/`

| Excluded | Reason |
|---|---|
| `.docs/` content | Documentation only |
| Firebase service account JSON | Secrets — env vars only |
| Generated mock data | No demo data in repo |
| Duplicate business logic | Single source in `lib/domain/calculations/` |
| Global CSS beyond `globals.css` | Tailwind utilities preferred |

---

*This structure supports incremental module delivery. Add module folders only when implementing that module — do not scaffold empty module directories for all 11 modules at once during Phase 0.*
