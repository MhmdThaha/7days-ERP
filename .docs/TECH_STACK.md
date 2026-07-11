# 7Days Bakery ERP — Technology Stack & Architecture

> **Document purpose:** Definitive reference for technology choices, project structure, integration patterns, and deployment. All implementation must conform to this document.

**Version:** 1.0  
**Last updated:** 2026-07-07

---

## 1. Stack Overview

```
┌──────────────────────────────────────────────────────────────┐
│                        Vercel (Hosting)                       │
├──────────────────────────────────────────────────────────────┤
│  Next.js 15+ (App Router)  │  Server Actions  │  API Routes  │
├──────────────────────────────────────────────────────────────┤
│  React 19  │  TypeScript 5  │  Tailwind CSS 4  │  shadcn/ui  │
├──────────────────────────────────────────────────────────────┤
│  TanStack Query  │  React Hook Form  │  Zod  │  Recharts     │
├──────────────────────────────────────────────────────────────┤
│  Firebase Auth  │  Cloud Firestore  │  Firebase Storage       │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Decisions

### 2.1 Next.js (App Router)

**Why:** Production-grade React framework with server components, built-in routing, API routes, and first-class Vercel deployment. App Router enables efficient data fetching and smaller client bundles.

**Configuration choices:**

| Choice | Decision | Rationale |
|---|---|---|
| Router | App Router only | Pages Router not used — no legacy support needed |
| Rendering | Hybrid (RSC + client islands) | Performance for dashboards; interactivity where needed |
| Data mutations | Server Actions (primary) | Type-safe, no API boilerplate for internal ops |
| API Routes | Secondary — webhooks, external integrations only | Keep internal ops on server actions |
| Middleware | Auth guard + org routing | Protect dashboard routes |

### 2.2 TypeScript

**Why:** Type safety is mandatory for a commercial ERP. Catches errors at compile time, improves AI and developer productivity.

- `strict: true` — non-negotiable
- Path aliases: `@/` → `src/`
- No JavaScript files in `src/` (config files excepted)

### 2.3 Tailwind CSS

**Why:** Utility-first CSS aligns with shadcn/ui, rapid consistent styling, small production bundle with purging.

- Use Tailwind CSS v4 conventions when scaffolding
- CSS variables for theming (shadcn pattern)
- No custom CSS files except `globals.css` and rare animations

### 2.4 shadcn/ui

**Why:** Accessible, customizable, copy-paste components — no black-box dependency. Full control over component code.

**Installed components (install as needed, not all upfront):**

```
button, input, label, form, select, table, dialog, sheet,
dropdown-menu, toast (sonner), card, badge, tabs, calendar,
popover, command, skeleton, alert, separator, scroll-area,
avatar, checkbox, textarea, switch, tooltip, breadcrumb,
sidebar, chart (shadcn chart wrapper for Recharts)
```

**Do not install:** Alternative component libraries (MUI, Ant Design, Chakra).

### 2.5 React Hook Form + Zod

**Why:** Performant forms with minimal re-renders; Zod provides runtime validation matching TypeScript types.

**Pattern:**

```typescript
// Schema drives both validation and types
const productSchema = z.object({ name: z.string().min(1) });
type ProductFormValues = z.infer<typeof productSchema>;

// Form resolver
const form = useForm<ProductFormValues>({
  resolver: zodResolver(productSchema),
});
```

- Schemas live in `src/lib/domain/schemas/`
- Reuse schemas on client forms AND server actions

### 2.6 TanStack Query (React Query)

**Why:** Server state management with caching, invalidation, optimistic updates, and loading/error states.

**Configuration:**

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,       // 1 minute default
      gcTime: 5 * 60 * 1000,      // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false, // reduce Firestore reads
    },
  },
});
```

**Query key convention:**

```typescript
// Hierarchical keys
['org', orgId, 'products', 'list', filters]
['org', orgId, 'products', 'detail', productId]
['org', orgId, 'inventory', 'balances']
['org', orgId, 'daily-summary', date]
```

**When to use Firestore real-time listeners instead:**

- Inventory balances on dashboard (optional real-time)
- Use TanStack Query with `refetchInterval` or manual invalidation as default; add listeners only where real-time is critical

### 2.7 Firebase

#### Firebase Authentication

| Feature | v1 | Phase 2 |
|---|---|---|
| Email/password | ✅ | |
| Email verification | ✅ recommended | |
| Password reset | ✅ | |
| Google OAuth | | ✅ |
| Custom claims (role) | ✅ via Admin SDK | |
| Multi-factor auth | | ✅ |

**Auth flow:**

```
Sign up → Create Firebase Auth user → Create Organization doc
       → Create User membership doc → Set custom claims
       → Redirect to onboarding
```

#### Cloud Firestore

**Why:** Real-time capable, scalable NoSQL, generous free tier for small bakeries, strong Firebase Auth integration.

- Native SDK on client for reads (with security rules)
- Firebase Admin SDK on server for mutations requiring elevated trust
- Transactions for inventory operations

**Decision: Server-side mutations for transactional writes**

Production, sales, and purchases mutate inventory atomically — these go through **Server Actions using Firebase Admin SDK** to ensure consistency and prevent client tampering.

Client reads use Firebase client SDK or server-fetched data via TanStack Query.

#### Firebase Storage

- Product images
- Expense receipts
- Org logo

### 2.8 Recharts

**Why:** Composable React chart library; integrates with shadcn chart wrapper.

**Usage:**

- Dynamic import charts to reduce bundle size
- Use shadcn `<ChartContainer>` for consistent theming
- Charts required in: Dashboard, Monthly Summary, Daily Summary trends

### 2.9 Vercel

**Why:** Zero-config Next.js deployment, preview URLs, edge middleware, analytics.

- Production: main branch auto-deploy
- Preview: PR branches
- Environment variables per environment

---

## 3. Project Structure

```
7daysBakeryErp/
├── .docs/                          # Project documentation (this folder)
├── .env.example                    # Environment template
├── .env.local                      # Local secrets (gitignored)
├── firebase/
│   ├── firestore.rules             # Security rules
│   ├── firestore.indexes.json      # Composite indexes
│   └── storage.rules               # Storage security rules
├── public/
│   └── assets/                     # Static assets
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx          # Sidebar shell
│   │   │   ├── page.tsx            # Dashboard
│   │   │   ├── products/
│   │   │   ├── recipes/
│   │   │   ├── purchases/
│   │   │   ├── production/
│   │   │   ├── sales/
│   │   │   ├── expenses/
│   │   │   ├── wastage/
│   │   │   ├── inventory/
│   │   │   ├── daily-summary/
│   │   │   ├── monthly-summary/
│   │   │   └── settings/
│   │   ├── api/                    # External-facing APIs only
│   │   ├── layout.tsx              # Root layout
│   │   ├── globals.css
│   │   └── providers.tsx           # Query, auth, theme providers
│   ├── components/
│   │   ├── ui/                     # shadcn components
│   │   ├── shared/                 # DataTable, PageHeader, MoneyDisplay, etc.
│   │   ├── layout/                 # Sidebar, TopBar, NavItems
│   │   └── [module]/               # Module-specific components
│   ├── hooks/
│   │   ├── use-auth.ts
│   │   ├── use-organization.ts
│   │   └── use-[entity].ts
│   ├── lib/
│   │   ├── domain/
│   │   │   ├── types/              # Core TypeScript types
│   │   │   ├── schemas/            # Zod schemas
│   │   │   └── calculations/       # Pure functions (profit, WAC, etc.)
│   │   ├── services/               # Business workflow orchestration
│   │   ├── repositories/           # Firestore data access
│   │   ├── firebase/
│   │   │   ├── client.ts           # Client SDK init
│   │   │   ├── admin.ts            # Admin SDK init (server only)
│   │   │   └── converters.ts       # Firestore ↔ domain type converters
│   │   └── utils/
│   │       ├── money.ts
│   │       ├── dates.ts
│   │       └── units.ts
│   ├── actions/                    # Server Actions grouped by module
│   │   ├── products.ts
│   │   └── ...
│   └── middleware.ts               # Auth route protection
├── components.json                 # shadcn config
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## 4. Authentication Architecture

### 4.1 Session Strategy

**Recommendation:** Firebase Auth ID token validated on server via session cookie.

```
Client login → Firebase Auth signIn → Get ID token
            → POST /api/auth/session → Set httpOnly cookie
            → Server verifies token on each request via middleware
```

**Why session cookies over client-only tokens:**

- Server Components can authenticate requests
- httpOnly cookies are not accessible to XSS
- Middleware can protect routes before render

**Library:** `firebase-admin` for token verification; custom session endpoint or `next-firebase-auth-edge` evaluated at implementation time.

### 4.2 Role-Based Access Control (RBAC)

| Role | Key |
|---|---|
| Owner | `owner` |
| Manager | `manager` |
| Production Staff | `production` |
| Sales Staff | `sales` |
| Store Staff | `store` |

Roles stored in:

1. `organizations/{orgId}/members/{userId}` document (source of truth)
2. Firebase Auth custom claims (cache for rules) — synced on role change

**Permission matrix** defined in `src/lib/domain/permissions.ts` — single file, checked in services and UI.

### 4.3 Middleware

```typescript
// Protected routes
const protectedPaths = ['/dashboard', '/products', '/recipes', ...];

// Auth routes (redirect if logged in)
const authPaths = ['/login', '/register'];
```

---

## 5. Data Flow Patterns

### 5.1 Read Pattern (List Page)

```
Page (RSC) → prefetch or client mount
           → useProducts(orgId, filters)  [TanStack Query]
           → productRepository.list(orgId, filters)  [Client SDK or Server Action]
           → Firestore query
           → Return typed Product[]
           → Render DataTable
```

### 5.2 Write Pattern (Create Production)

```
ProductionForm (client)
  → onSubmit → createProductionAction(data)  [Server Action]
    → validate with Zod
    → check user role
    → productionService.create(orgId, data)
      → Firestore transaction:
          1. Write production document
          2. Write inventory movements (raw OUT, finished IN)
          3. Update inventory balance documents
      → return success
  → invalidate queries ['org', orgId, 'production', ...]
  → toast success
```

### 5.3 Summary Aggregation Pattern

**Recommendation:** Materialized daily summaries (denormalized documents).

```
On transaction write → trigger summary recalculation for affected date
                     → update organizations/{orgId}/dailySummaries/{YYYY-MM-DD}
```

**Why not compute on every read:** Dashboard and monthly views would require scanning all transactions — expensive and slow at scale.

Recalculation implemented in service layer, invoked after every transactional mutation affecting that date.

---

## 6. Firebase Admin vs Client SDK

| Operation | SDK | Reason |
|---|---|---|
| User signup/login | Client | Firebase Auth UI flow |
| Read products list | Client (with rules) or Server | Performance |
| Create production + inventory | **Admin (Server Action)** | Atomic transaction, trusted |
| Read daily summary | Client or Server | Pre-computed doc, safe |
| Set custom claims | **Admin** | Privileged operation |
| Upload receipt | Client (with rules) | Direct upload pattern |

**Rule:** If it changes inventory or financial data, it goes through Admin SDK on the server.

---

## 7. Money Handling

```typescript
// All amounts stored as integers (paise for INR)
type Money = number; // integer, minor units

// Display
formatMoney(15000) → "₹150.00"

// Input: user enters "150.00" → parse to 15000
parseMoneyInput("150.00") → 15000

// Calculations: integer math only, no floats
```

---

## 8. Date Handling

```typescript
// Storage: Firestore Timestamp (UTC)
// Business logic: org timezone for "today" boundaries
// Display: format in org locale

getOrgToday(timezone: string): string // 'YYYY-MM-DD'
isBusinessDateValid(date: string, timezone: string): boolean
```

**Library:** `date-fns` + `date-fns-tz` for timezone-aware operations.

---

## 9. Error Boundaries & Loading

| Pattern | Implementation |
|---|---|
| Route loading | `loading.tsx` per route segment |
| Route errors | `error.tsx` with retry |
| Global error | `global-error.tsx` |
| Component suspense | `<Suspense fallback={<Skeleton />}>` |
| Mutation errors | Toast + form field errors |

---

## 10. Environment Variables

```bash
# .env.example

# Firebase Client (public)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin (server only — secret)
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=7Days Bakery ERP

# Optional
NODE_ENV=development
```

---

## 11. Deployment Pipeline

```
Developer → Feature branch → PR → Vercel Preview URL
                                → Review + test
                                → Merge to main → Vercel Production

Firebase rules/indexes → Deploy via Firebase CLI in CI or manual
```

### 11.1 CI Checks (recommended)

```yaml
- npm run lint
- npm run typecheck
- npm run test
- npm run build
```

### 11.2 Firebase Deploy

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

---

## 12. Package List (Initial)

```json
{
  "dependencies": {
    "next": "latest",
    "react": "latest",
    "react-dom": "latest",
    "firebase": "^11",
    "firebase-admin": "^13",
    "@tanstack/react-query": "^5",
    "react-hook-form": "^7",
    "@hookform/resolvers": "^3",
    "zod": "^3",
    "date-fns": "^4",
    "date-fns-tz": "^3",
    "recharts": "^2",
    "lucide-react": "latest",
    "class-variance-authority": "latest",
    "clsx": "latest",
    "tailwind-merge": "latest",
    "sonner": "latest"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/node": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "tailwindcss": "^4",
    "eslint": "latest",
    "eslint-config-next": "latest",
    "prettier": "latest",
    "vitest": "latest"
  }
}
```

Install shadcn/ui via CLI during scaffold — not an npm package.

---

## 13. Performance Strategy

| Area | Strategy |
|---|---|
| Dashboard | Pre-computed daily summaries; parallel query fetch |
| Lists | Cursor pagination; Firestore `limit()` + `startAfter()` |
| Images | Next.js Image; Firebase Storage resize extension (Phase 2) |
| Charts | Dynamic `import()` |
| Bundle | Analyze with `@next/bundle-analyzer` in CI |
| Caching | TanStack Query staleTime tuned per entity type |

---

## 14. Monitoring & Observability (Phase 2)

| Tool | Purpose |
|---|---|
| Vercel Analytics | Web vitals |
| Sentry | Error tracking |
| Firebase Console | Auth, Firestore usage |
| Custom audit log | Business-critical mutations |

---

## 15. Architecture Decision Records

### ADR-001: Firestore over PostgreSQL

**Context:** Need real-time inventory, rapid development, Firebase Auth integration.  
**Decision:** Cloud Firestore as primary database.  
**Consequences:** Complex queries limited; use denormalization and pre-aggregation. No SQL joins — design for query patterns upfront.

### ADR-002: Server Actions for Mutations

**Context:** Inventory transactions must be trusted and atomic.  
**Decision:** All inventory-affecting mutations via Server Actions + Admin SDK.  
**Consequences:** Cannot call from external systems without API route wrapper.

### ADR-003: Materialized Daily Summaries

**Context:** Dashboard must load fast; scanning all transactions is expensive.  
**Decision:** Maintain `dailySummaries` documents updated on write.  
**Consequences:** Slight write amplification; must recalculate on edit/delete.

### ADR-004: Integer Money Storage

**Context:** Floating-point errors unacceptable in financial software.  
**Decision:** Store all amounts as integer minor units.  
**Consequences:** Conversion required at UI boundary; consistent formatting utilities needed.

### ADR-005: Single Org per User (v1)

**Context:** Simplify auth and data model for initial commercial release.  
**Decision:** One user belongs to one organization.  
**Consequences:** Users managing multiple bakeries need separate accounts until Phase 2.

---

*Refer to `.docs/DATABASE.md` for collection schemas and `.docs/RULES.md` for coding standards.*
