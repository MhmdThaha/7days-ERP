# 05 — Routing & Navigation

> **Document purpose:** URL structure, route groups, navigation configuration, middleware, drill-down linking, and role-based route access.

**Version:** 1.0  
**Last updated:** 2026-07-07  
**Status:** Draft — pending owner approval

**Related:** [UI_GUIDELINES.md](../UI_GUIDELINES.md) · [07-security-auth.md](./07-security-auth.md) · [01-project-structure.md](./01-project-structure.md)

---

## 1. Routing Strategy

| Decision | Choice | Rationale |
|---|---|---|
| Router | Next.js App Router only | Per TECH_STACK.md |
| Route groups | `(auth)` and `(dashboard)` | Separate layouts without URL prefix |
| Dynamic segments | `[id]`, `[itemKey]` | Entity detail pages |
| Filters | `searchParams` | Shareable URLs for date drill-down from dashboard |
| API routes | Minimal — auth session only | Internal ops use Server Actions |
| Default landing | `/` → Dashboard | Owner's primary need after login |

---

## 2. Complete Route Map

### 2.1 Public / Auth Routes

| Route | Page | Access |
|---|---|---|
| `/login` | Login | Unauthenticated only |
| `/register` | Register + create org | Unauthenticated only |
| `/forgot-password` | Password reset request | Unauthenticated only |
| `/reset-password` | Password reset confirm | Token-based |

**Middleware behavior:** Authenticated users visiting auth routes → redirect to `/`.

### 2.2 Dashboard Routes (Authenticated)

| Route | Module | Nav Label | Min Role |
|---|---|---|---|
| `/` | Dashboard | Dashboard | All members |
| `/products` | 01 | Products | All (write: owner, manager) |
| `/products/new` | 01 | — | owner, manager |
| `/products/[id]` | 01 | — | All (write: owner, manager) |
| `/raw-materials` | 02 | Raw Materials | owner, manager, production |
| `/raw-materials/new` | 02 | — | owner, manager |
| `/raw-materials/[id]` | 02 | — | owner, manager |
| `/recipes` | 02 | Recipes | owner, manager, production (read) |
| `/recipes/new` | 02 | — | owner, manager |
| `/recipes/[id]` | 02 | — | owner, manager |
| `/purchases` | 03 | Purchases | owner, manager |
| `/purchases/new` | 03 | — | owner, manager |
| `/purchases/[id]` | 03 | — | owner, manager |
| `/production` | 04 | Production | All (write: owner, manager, production) |
| `/production/new` | 04 | — | owner, manager, production |
| `/production/[id]` | 04 | — | owner, manager, production |
| `/sales` | 05 | Sales | All (write: owner, manager, sales, store) |
| `/sales/new` | 05 | — | owner, manager, sales, store |
| `/sales/[id]` | 05 | — | owner, manager, sales, store |
| `/expenses` | 06 | Expenses | owner, manager |
| `/expenses/new` | 06 | — | owner, manager |
| `/expenses/[id]` | 06 | — | owner, manager |
| `/wastage` | 07 | Wastage | owner, manager, production, store |
| `/wastage/new` | 07 | — | owner, manager, production, store |
| `/wastage/[id]` | 07 | — | owner, manager, production, store |
| `/inventory` | 08 | Inventory | All |
| `/inventory/movements` | 08 | — (sub-nav) | All |
| `/inventory/low-stock` | 08 | — (sub-nav) | owner, manager, production |
| `/inventory/adjustments/new` | 08 | — | owner, manager |
| `/inventory/[itemKey]` | 08 | — | All |
| `/daily-summary` | 09 | Daily Summary | owner, manager, production (read) |
| `/monthly-summary` | 10 | Monthly Summary | owner, manager |
| `/settings` | 0 | Settings | owner, manager |
| `/settings/organization` | 0 | — | owner |
| `/settings/categories` | 0 | — | owner, manager |
| `/settings/members` | 0 | — | owner |
| `/onboarding` | 0 | — (no nav) | owner (first login) |

### 2.3 API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/auth/session` | POST | Exchange Firebase ID token for httpOnly session cookie |
| `/api/auth/session` | DELETE | Clear session cookie (logout) |

All other operations use Server Actions — no REST API for business entities in v1.

---

## 3. Search Params Conventions

Standard query parameters for filterable list and summary pages:

| Param | Format | Example | Used By |
|---|---|---|---|
| `date` | `YYYY-MM-DD` | `?date=2026-07-07` | daily-summary |
| `month` | `YYYY-MM` | `?month=2026-07` | monthly-summary |
| `from` | `YYYY-MM-DD` | `?from=2026-07-01` | list date range start |
| `to` | `YYYY-MM-DD` | `?to=2026-07-07` | list date range end |
| `q` | string | `?q=bread` | search query |
| `category` | string | `?category=Bread` | product/expense filter |
| `channel` | string | `?channel=wholesale` | sales filter |
| `type` | string | `?type=raw_material` | inventory/wastage filter |
| `page` | number | `?page=2` | pagination |
| `status` | `active`\|`inactive`\|`all` | `?status=active` | master lists |

**Default behavior when param absent:**

| Page | Default |
|---|---|
| Transaction lists | `from` and `to` = today |
| Master lists | All active records |
| daily-summary | `date` = today (org TZ) |
| monthly-summary | `month` = current month |

---

## 4. Drill-Down Links (Dashboard → Module)

Dashboard KPI cards and widgets link to filtered module views:

| Widget | Target URL |
|---|---|
| Today's Sales | `/sales?from={today}&to={today}` |
| Today's Production | `/production?from={today}&to={today}` |
| Today's Expenses | `/expenses?from={today}&to={today}` |
| Today's Purchases | `/purchases?from={today}&to={today}` |
| Today's Net Profit | `/daily-summary?date={today}` |
| Low Stock item | `/inventory/{itemKey}` |
| Low Stock widget (view all) | `/inventory/low-stock` |
| Best Seller row | `/sales?from={today}&to={today}&q={productName}` |
| Wastage Today | `/wastage?from={today}&to={today}` |
| MTD Revenue | `/monthly-summary?month={currentMonth}` |
| Chart data point (Jul 3) | `/daily-summary?date=2026-07-03` |

**Implementation:** Centralize in `lib/utils/navigation-links.ts` — do not hardcode URLs in widget components.

---

## 5. Navigation Configuration

### 5.1 Nav Item Schema

```typescript
interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  module: string;              // For active state matching
  roles: MemberRole[];         // Who sees this item
  children?: NavItem[];        // Sub-nav (inventory)
  badge?: 'lowStock';          // Dynamic badge count
}
```

### 5.2 Sidebar Structure

```
📊 Dashboard                    [all]
─────────────
📦 Products                     [all]
📋 Recipes                      [owner, manager, production]
🧪 Raw Materials                [owner, manager, production]
─────────────
🛒 Purchases                    [owner, manager]
🏭 Production                   [all]
💰 Sales                        [all]
💸 Expenses                     [owner, manager]
🗑️ Wastage                      [owner, manager, production, store]
─────────────
📦 Inventory                    [all]
   ├── Stock Levels
   ├── Movements
   └── Low Stock               [owner, manager, production]
─────────────
📅 Daily Summary                [owner, manager, production]
📆 Monthly Summary              [owner, manager]
─────────────
⚙️ Settings                     [owner, manager]
```

### 5.3 Active State Logic

- Exact match for list pages: `/products` active on `/products`
- Prefix match for detail: `/products/[id]` highlights Products nav
- Nested routes: `/inventory/movements` highlights Inventory parent

### 5.4 Role Filtering

`AppSidebar` filters `navItems` where `user.role` is in `item.roles`. Hidden items are not rendered — not disabled.

---

## 6. Middleware

`src/middleware.ts` runs on all routes except static assets.

### 6.1 Responsibilities

```
1. Read session cookie
2. Verify session (lightweight — decode or call verify endpoint)
3. Route classification:
   - Public auth routes
   - Protected dashboard routes
   - API routes
4. Redirect unauthenticated → /login
5. Redirect authenticated on /login → /
6. Optional: role check for restricted routes (primary check in page/action)
```

### 6.2 Matcher Config

```
matcher: [
  '/((?!_next/static|_next/image|favicon.ico|assets/).*)',
]
```

### 6.3 What Middleware Does NOT Do

- Firestore queries (too slow for edge)
- Fine-grained permission checks (done in Server Actions)
- Organization validation (done in auth-server.ts per request)

---

## 7. Layout Hierarchy

```
app/layout.tsx                          # Root: fonts, providers
├── (auth)/layout.tsx                   # Centered card, no sidebar
│   └── login/page.tsx
│
└── (dashboard)/layout.tsx              # Sidebar + top bar
    ├── page.tsx                        # Dashboard
    ├── products/
    │   ├── loading.tsx                 # Route-level skeleton
    │   └── page.tsx
    └── ...
```

### 7.1 Dashboard Layout Responsibilities

- Verify session server-side (`getCurrentUser()`)
- Load org context (name, timezone)
- Render `AppSidebar` + `TopBar` + `{children}`
- Pass org context via React context or props

### 7.2 Loading & Error Boundaries

| File | Scope |
|---|---|
| `(dashboard)/loading.tsx` | Generic dashboard skeleton |
| `(dashboard)/error.tsx` | Dashboard error with retry |
| `{module}/loading.tsx` | Module-specific skeleton (optional, preferred) |
| `{module}/error.tsx` | Module error boundary (optional) |

---

## 8. Breadcrumbs

Auto-generated from pathname using nav config labels:

| Path | Breadcrumb |
|---|---|
| `/products` | Dashboard / Products |
| `/products/new` | Dashboard / Products / New Product |
| `/products/abc123` | Dashboard / Products / {product.name} |
| `/inventory/movements` | Dashboard / Inventory / Movements |

Product name in breadcrumb loaded client-side after fetch — fallback to "Edit Product" until loaded.

---

## 9. Quick Actions (Top Bar)

| Action | Route | Visible To |
|---|---|---|
| Record Sale | `/sales/new` | owner, manager, sales, store |
| Record Production | `/production/new` | owner, manager, production |
| Record Purchase | `/purchases/new` | owner, manager |
| Record Expense | `/expenses/new` | owner, manager |
| Record Wastage | `/wastage/new` | owner, manager, production, store |

Quick actions filtered by same role rules as nav items.

---

## 10. Onboarding Flow Routes

Post-register redirect chain:

```
/register success
  → /onboarding (if org setup incomplete)
      Step 1: /onboarding?step=settings
      Step 2: /onboarding?step=materials  (skippable)
      Step 3: /onboarding?step=products   (skippable)
      Step 4: → / (dashboard)
  → / (if onboarding complete)
```

`organization.onboardingComplete` flag on org document controls redirect.

---

## 11. Route Protection Layers

Defense in depth — three layers:

```
Layer 1: Middleware
  └── Session exists?

Layer 2: Dashboard layout / page
  └── User has org membership?

Layer 3: Server Action
  └── Role can perform this action?
```

UI hiding (nav items, buttons) is **UX only** — not security. Layer 3 is authoritative.

---

## 12. 404 and Unauthorized

| Scenario | Behavior |
|---|---|
| Unknown route | `not-found.tsx` |
| Valid route, no permission | Redirect to `/` with toast "Access denied" OR inline 403 page |
| Entity not found `[id]` | `not-found.tsx` within module |
| Entity belongs to different org | `not-found.tsx` (don't reveal existence) |

---

## 13. Mobile Navigation

| Breakpoint | Behavior |
|---|---|
| `< lg` | Sidebar hidden; hamburger opens Sheet/Drawer |
| `≥ lg` | Sidebar visible, collapsible to icons |

Mobile nav uses same `navItems` config — single source.

---

## 14. Route Implementation Schedule

| Phase | Routes Added |
|---|---|
| 0 | `/login`, `/register`, `/`, `/settings`, `/onboarding` |
| 1 | `/products/*` |
| 2 | `/raw-materials/*`, `/recipes/*` |
| 3 | `/purchases/*` |
| 4 | `/production/*` |
| 5 | `/sales/*` |
| 6 | `/expenses/*` |
| 7 | `/wastage/*` |
| 8 | `/inventory/*` |
| 9 | `/daily-summary` |
| 10 | `/monthly-summary` |
| 11 | Enhance `/` dashboard widgets |

**Do not register nav items for modules not yet implemented** — add to `nav-items.ts` when module ships.

---

## 15. URL & SEO Notes

- Authenticated ERP — no public SEO requirements
- Add `<title>` per page via Next.js metadata: `"Products | 7Days Bakery ERP"`
- `robots: noindex` on all dashboard routes
- Auth routes may be indexed (optional — default noindex)

---

*Role definitions and permission matrix in [07-security-auth.md](./07-security-auth.md). Navigation UI specs in [UI_GUIDELINES.md](../UI_GUIDELINES.md).*
