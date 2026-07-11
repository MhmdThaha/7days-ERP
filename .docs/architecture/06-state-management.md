# 06 — State Management

> **Document purpose:** How application state is categorized, stored, cached, synchronized, and invalidated across the Bakery ERP.

**Version:** 1.0  
**Last updated:** 2026-07-07  
**Status:** Draft — pending owner approval

**Related:** [TECH_STACK.md](../TECH_STACK.md) · [04-firestore-services.md](./04-firestore-services.md)

---

## 1. State Management Philosophy

| Principle | Application |
|---|---|
| **Server state ≠ client state** | Firestore data is server state — TanStack Query owns it |
| **No global client store for business data** | No Redux/Zustand for products, sales, inventory |
| **URL is state for filters** | Date ranges, search, pagination in `searchParams` |
| **Forms are local state** | React Hook Form — uncommitted until submit |
| **Minimize client JavaScript** | Default RSC; client only for interactivity |
| **Invalidate, don't manually sync** | After mutation, invalidate query keys — don't patch cache by hand |

---

## 2. State Categories

```
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION STATE                         │
├──────────────┬──────────────┬──────────────┬────────────────┤
│ Server State │ Auth State   │ URL State    │ UI Local State │
│ (TanStack    │ (Context)    │ (searchParams│ (useState,     │
│  Query)      │              │  router)     │  React Hook    │
│              │              │              │  Form)         │
├──────────────┴──────────────┴──────────────┴────────────────┤
│ Session State (httpOnly cookie — not in React state)         │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Server State (TanStack Query)

Primary mechanism for all Firestore reads displayed in UI.

### 3.1 Query Client Configuration

```typescript
// providers/query-provider.tsx
defaultOptions: {
  queries: {
    staleTime: 60_000,           // 1 min — reduce Firestore reads
    gcTime: 300_000,             // 5 min cache retention
    retry: 1,
    refetchOnWindowFocus: false, // ERP users keep tab open — avoid refetch storms
    refetchOnReconnect: true,
  },
  mutations: {
    retry: 0,                    // Mutations via server actions — no auto retry
  },
}
```

### 3.2 Query Key Hierarchy

Hierarchical keys enable precise invalidation:

```typescript
// lib/domain/constants/query-keys.ts
export const queryKeys = {
  org: (orgId: string) => ['org', orgId] as const,

  products: {
    all: (orgId: string) => [...queryKeys.org(orgId), 'products'] as const,
    list: (orgId: string, filters: ProductFilters) =>
      [...queryKeys.products.all(orgId), 'list', filters] as const,
    detail: (orgId: string, id: string) =>
      [...queryKeys.products.all(orgId), 'detail', id] as const,
  },

  inventory: {
    balances: (orgId: string, filters?: InventoryFilters) =>
      [...queryKeys.org(orgId), 'inventory', 'balances', filters] as const,
    movements: (orgId: string, itemId?: string) =>
      [...queryKeys.org(orgId), 'inventory', 'movements', itemId] as const,
    lowStock: (orgId: string) =>
      [...queryKeys.org(orgId), 'inventory', 'lowStock'] as const,
  },

  dailySummary: (orgId: string, date: string) =>
    [...queryKeys.org(orgId), 'dailySummary', date] as const,

  monthlySummary: (orgId: string, month: string) =>
    [...queryKeys.org(orgId), 'monthlySummary', month] as const,

  dashboard: (orgId: string) =>
    [...queryKeys.org(orgId), 'dashboard'] as const,
};
```

### 3.3 Query Hooks Catalog

| Hook | Query Key | Fetch Method | staleTime |
|---|---|---|---|
| `useProducts(filters)` | `products.list` | Client SDK | 60s |
| `useProduct(id)` | `products.detail` | Client SDK | 60s |
| `useRawMaterials(filters)` | `rawMaterials.list` | Client SDK | 60s |
| `useRecipes(filters)` | `recipes.list` | Client SDK | 60s |
| `usePurchases(filters)` | `purchases.list` | Client SDK | 30s |
| `useProduction(filters)` | `production.list` | Client SDK | 30s |
| `useSales(filters)` | `sales.list` | Client SDK | 30s |
| `useExpenses(filters)` | `expenses.list` | Client SDK | 60s |
| `useWastage(filters)` | `wastage.list` | Client SDK | 60s |
| `useInventoryBalances(filters)` | `inventory.balances` | Client SDK | 30s |
| `useInventoryMovements(itemId)` | `inventory.movements` | Client SDK | 30s |
| `useLowStock()` | `inventory.lowStock` | Client SDK | 60s |
| `useDailySummary(date)` | `dailySummary` | Client SDK | 30s |
| `useMonthlySummary(month)` | `monthlySummary` | Client SDK | 60s |
| `useDashboard()` | `dashboard` | Parallel queries | 60s |
| `useOrganization()` | `org.settings` | Client SDK | 5min |

**Transactional data** (purchases, sales, production): shorter staleTime (30s) — changes frequently during business day.

**Master data** (products, recipes): longer staleTime (60s–5min) — changes infrequently.

### 3.4 Invalidation Map (After Mutations)

When a Server Action succeeds, client invalidates affected keys:

| Mutation | Invalidate |
|---|---|
| `createProduct` | `products.list`, `products.detail` |
| `createPurchase` | `purchases.list`, `inventory.balances`, `inventory.lowStock`, `dailySummary(date)`, `dashboard`, `rawMaterials.list` |
| `createProduction` | `production.list`, `inventory.balances`, `dailySummary(date)`, `dashboard`, `products.list` |
| `createSales` | `sales.list`, `inventory.balances`, `dailySummary(date)`, `dashboard`, `products.list` |
| `createExpense` | `expenses.list`, `dailySummary(date)`, `dashboard` |
| `createWastage` | `wastage.list`, `inventory.balances`, `dailySummary(date)`, `dashboard` |
| `closeDay` | `dailySummary(date)` |
| `createRecipe` | `recipes.list`, `products.detail` (activeRecipeId) |

**Pattern in form submit handler:**

```typescript
const result = await createPurchaseAction(data);
if (result.success) {
  queryClient.invalidateQueries({ queryKey: queryKeys.purchases.all(orgId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.inventory.balances(orgId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.dailySummary(orgId, date) });
  queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(orgId) });
  toast.success('Purchase saved');
  router.push('/purchases');
}
```

### 3.5 Dashboard Parallel Fetch

`useDashboard` runs parallel queries:

```typescript
useQueries({
  queries: [
    { queryKey: dailySummary(today), ... },
    { queryKey: dailySummary(yesterday), ... },
    { queryKey: monthlySummary(currentMonth), ... },
    { queryKey: lowStock(), ... },
    { queryKey: dailySummaryTrend(last30Days), ... },
  ],
});
```

Each widget shows independent skeleton — partial load acceptable.

---

## 4. Auth State (React Context)

### 4.1 AuthProvider

```typescript
interface AuthContextValue {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;  // users/{uid} doc
  member: OrganizationMember | null;
  organization: Organization | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}
```

- Listens to `onAuthStateChanged` (Firebase client SDK)
- Loads user profile + member + org docs on auth
- Provided at root — available to all client components

### 4.2 useAuth / useOrganization / usePermissions

| Hook | Returns |
|---|---|
| `useAuth()` | Full auth context |
| `useOrganization()` | `{ org, orgId, timezone, currency, settings }` |
| `usePermissions()` | `{ can(action, resource), role }` |

**Permissions** derived from `lib/domain/permissions.ts` — not stored separately.

---

## 5. URL State (searchParams)

Filters and navigation state live in the URL for shareability and back-button support.

### 5.1 Pattern

```typescript
// hooks/use-date-filter.ts
function useDateFilter(defaultToToday = true) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { timezone } = useOrganization();

  const from = searchParams.get('from') ?? (defaultToToday ? getOrgToday(timezone) : undefined);
  const to = searchParams.get('to') ?? (defaultToToday ? getOrgToday(timezone) : undefined);

  const setRange = (from: string, to: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('from', from);
    params.set('to', to);
    router.push(`?${params.toString()}`);
  };

  return { from, to, setRange };
}
```

### 5.2 What Goes in URL vs Query State

| URL (searchParams) | Query cache key (not URL) |
|---|---|
| Date range filters | — |
| Search query | Included in query key |
| Category filter | Included in query key |
| Pagination page | Included in query key |
| Sort column/direction | Included in query key |
| Form draft data | Never URL |
| Modal open state | Local useState (unless shareable) |

---

## 6. Form State (React Hook Form)

### 6.1 Scope

All create/edit forms use React Hook Form + Zod resolver.

| Form | Default Values Source |
|---|---|
| Create product | Empty + defaults |
| Edit product | `useProduct(id)` data → `reset()` on load |
| Create sale | Today's date, last channel/payment from sessionStorage |
| Line-item forms | Empty array; add row appends default line |

### 6.2 Line Item Array Pattern

```typescript
const { fields, append, remove } = useFieldArray({ control, name: 'lines' });

// Computed totals — use watch + useMemo, NOT separate state
const lines = watch('lines');
const netTotal = useMemo(() => computeNetTotal(lines), [lines]);
```

**Rule:** Derived form values (totals, running sums) computed from `watch()` — never duplicate in `useState`.

### 6.3 Session Storage (Ephemeral UX)

| Key | Data | Used By |
|---|---|---|
| `lastSalesChannel` | string | Sales form default |
| `lastPaymentMethod` | string | Sales form default |

Not persisted to Firestore — UX convenience only.

### 6.4 Dirty Form Protection

- Cancel on dirty form → `ConfirmDialog` "Discard unsaved changes?"
- Browser `beforeunload` optional (annoying — use ConfirmDialog only)

---

## 7. UI Local State (useState)

Minimal local state for UI interactions only:

| State | Example | Location |
|---|---|---|
| Sidebar collapsed | `useState(false)` | AppSidebar |
| Dialog open | `useState(false)` | ConfirmDialog |
| Dropdown open | shadcn manages | DropdownMenu |
| Active tab | Tabs component | Inventory tabs |
| Table sorting | TanStack Table internal | DataTable |
| Combobox search input | Command internal | ProductCombobox |
| Image preview | useState before upload | ProductImageUpload |

**Never** store business entities in component `useState` that should be in TanStack Query.

---

## 8. Session State (httpOnly Cookie)

Not accessible to React — managed server-side.

| Aspect | Detail |
|---|---|
| Cookie name | `session` (httpOnly, secure, sameSite: lax) |
| Contents | Firebase session cookie or signed JWT reference |
| Set by | `POST /api/auth/session` |
| Cleared by | `DELETE /api/auth/session` |
| Verified by | Middleware (light) + `getCurrentUser()` in Server Actions (full) |
| Expiry | Firebase default (14 days) or configurable |

Client Firebase Auth state and server session cookie must stay synchronized — on logout, clear both.

---

## 9. Real-Time vs Polling

| Data | Strategy | Reason |
|---|---|---|
| Product master | TanStack Query (60s stale) | Changes infrequently |
| Sales list (today) | Invalidate on mutation | Real-time not critical |
| Inventory balances | Invalidate on mutation; optional 60s refetchInterval on dashboard | Near real-time sufficient |
| Dashboard KPIs | Invalidate on mutation | Summary doc read is cheap |
| Low stock alerts | Same as inventory | — |

**v1 decision:** No Firestore `onSnapshot` listeners except potential future dashboard toggle. TanStack Query invalidation is sufficient for single-location bakery.

**Phase 2 option:** Real-time listener on `dailySummaries/{today}` for dashboard auto-refresh.

---

## 10. Optimistic Updates

**v1 default:** No optimistic updates — wait for server action response.

**Candidate for Phase 2:** Sales module (counter speed) — optimistically update sales list and show pending state.

If implemented:

```typescript
onMutate: async (newSale) => {
  await queryClient.cancelQueries({ queryKey: salesKey });
  const previous = queryClient.getQueryData(salesKey);
  queryClient.setQueryData(salesKey, (old) => [...old, optimisticSale]);
  return { previous };
},
onError: (err, vars, context) => {
  queryClient.setQueryData(salesKey, context.previous);
},
onSettled: () => queryClient.invalidateQueries({ queryKey: salesKey }),
```

---

## 11. Error State Handling

| Layer | Pattern |
|---|---|
| Query error | `isError` → inline Alert or error boundary |
| Mutation error | Toast with message from `ActionResult.error` |
| Form validation | Inline field errors via FormMessage |
| Domain errors | Map `code` to user-friendly message |

Centralized error message map in `lib/domain/errors.ts`:

```typescript
const ERROR_MESSAGES: Record<string, string> = {
  INSUFFICIENT_STOCK: 'Not enough stock available',
  DAY_CLOSED: 'This day is closed for editing',
  ...
};
```

---

## 12. Loading State Handling

| Pattern | Usage |
|---|---|
| Route `loading.tsx` | Initial page navigation |
| Query `isLoading` | First fetch — full skeleton |
| Query `isFetching` | Background refetch — subtle indicator (optional) |
| Mutation `isPending` | Disable submit button, show spinner |
| Suspense boundary | Server component async children |

**Dashboard:** Per-widget skeletons — don't block entire page for one slow query.

---

## 13. State Persistence Summary

| State Type | Storage | Lifetime |
|---|---|---|
| Firestore business data | Cloud Firestore | Permanent |
| Query cache | Memory (TanStack Query) | Session; gcTime 5min |
| Auth session | httpOnly cookie + Firebase Auth | 14 days |
| Form draft | Memory (React Hook Form) | Until submit/navigate |
| Last sales channel | sessionStorage | Browser tab |
| Sidebar collapsed | localStorage (optional) | Persistent preference |
| URL filters | URL | Shareable, bookmarkable |

---

## 14. Anti-Patterns

| Don't | Do Instead |
|---|---|
| Store products in Zustand | TanStack Query |
| Pass orgId through 5 levels of props | `useOrganization()` |
| Manually update query cache after purchase | `invalidateQueries` |
| Fetch in useEffect | TanStack Query hook |
| Keep form totals in useState | `watch()` + useMemo |
| Global event bus for invalidation | Query key invalidation |
| Redux for UI modal state | Local useState |

---

## 15. State Management by Module

| Module | Primary State Mechanism |
|---|---|
| Product Master | TanStack Query + RHF form |
| Recipe Master | TanStack Query + RHF form + computed cost (useMemo) |
| Purchases | TanStack Query + RHF field array + URL date filter |
| Production | TanStack Query + RHF field array + material preview (useMemo) |
| Sales | TanStack Query + RHF field array + sessionStorage defaults |
| Expenses | TanStack Query + RHF form |
| Wastage | TanStack Query + RHF form |
| Inventory | TanStack Query (read-only) + RHF adjustment form |
| Daily Summary | TanStack Query (single doc) + URL date param |
| Monthly Summary | TanStack Query + URL month param |
| Dashboard | TanStack Query parallel + Auth context |

---

*Server Actions and service layer documented in [04-firestore-services.md](./04-firestore-services.md). Auth context detailed in [07-security-auth.md](./07-security-auth.md).*
