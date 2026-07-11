# 7Days Bakery ERP — Development Rules

> **Document purpose:** Mandatory rules for all developers and AI coding sessions. These rules override general coding habits when they conflict. Violations require explicit owner approval.

**Version:** 1.0  
**Last updated:** 2026-07-07

---

## 1. Golden Rules (Non-Negotiable)

| # | Rule |
|---|---|
| 1 | **Never implement more than one business module at a time.** Finish, test, and get approval before starting the next. |
| 2 | **Never generate placeholder or stub implementations** in production code paths (no `TODO: implement later`, no fake data returns, no empty handlers). |
| 3 | **Never use TypeScript `any`.** Use `unknown` with narrowing, generics, or proper types. |
| 4 | **Never duplicate business logic.** Calculations, validations, and inventory rules live in one place — the domain/service layer. |
| 5 | **Never update inventory directly from UI components.** All stock changes go through the inventory service. |
| 6 | **Never skip multi-tenant scoping.** Every query and write must include `organizationId`. |
| 7 | **Never commit secrets** (`.env`, service account keys, API keys) to version control. |
| 8 | **Never rush.** Read `.docs/BUSINESS.md` and module-specific context before writing code. |
| 9 | **Never copy Excel UI.** Implement better workflows; preserve Excel **logic** only. |
| 10 | **Always explain architectural decisions** to the owner before implementing significant changes. |

---

## 2. Module Implementation Order

Modules **must** be built in this sequence due to data dependencies:

```
Phase 0: Foundation (no business module)
  ├── Project scaffold
  ├── Auth & org setup
  ├── Base layout & navigation shell
  └── Shared utilities (money, dates, units)

Phase 1: Masters
  ├── 1. Product Master
  ├── 2. Recipe Master (+ Raw Material master entity — required by recipes)
  └── Note: Raw Material entity is introduced with Recipe Master if not already present

Phase 2: Transactions
  ├── 3. Raw Material Purchases
  ├── 4. Daily Production
  ├── 5. Daily Sales
  ├── 6. Expenses
  └── 7. Wastage

Phase 3: Derived Views
  ├── 8. Inventory (ledger + balances — partial build may start after Purchases)
  ├── 9. Daily Summary
  └── 10. Monthly Summary

Phase 4: Command Center
  └── 11. Management Dashboard
```

### 2.1 Module Completion Checklist

A module is **done** only when ALL of the following are complete:

- [ ] Domain types and Zod schemas
- [ ] Repository (Firestore data access)
- [ ] Service layer (business logic)
- [ ] API routes or server actions (if applicable)
- [ ] UI pages and components
- [ ] Loading, empty, and error states
- [ ] Role-based access enforced
- [ ] Firestore security rules updated
- [ ] Manual test plan executed
- [ ] Owner approval received

### 2.2 Partial Inventory Exception

Inventory **balances and movements** must be implemented alongside the first transaction that affects stock (Purchases). The Inventory **UI module** (views, ledger browser, alerts) is completed in Phase 3 after all transaction types exist.

---

## 3. Architecture Rules

### 3.1 Layer Separation

```
┌─────────────────────────────────────┐
│  UI Layer (React Components)        │  ← No business logic, no Firestore SDK
├─────────────────────────────────────┤
│  Application Layer (Hooks, Forms)   │  ← Orchestration, TanStack Query
├─────────────────────────────────────┤
│  Domain / Service Layer             │  ← Business rules, calculations
├─────────────────────────────────────┤
│  Data Access Layer (Repositories)   │  ← Firestore reads/writes only
└─────────────────────────────────────┘
```

| Layer | Location | Responsibilities |
|---|---|---|
| UI | `src/components/`, `src/app/**/page.tsx` | Render, user input, display |
| Application | `src/hooks/`, `src/app/**/actions.ts` | Data fetching, form submit orchestration |
| Domain | `src/lib/domain/`, `src/lib/services/` | Validations, calculations, workflows |
| Data | `src/lib/repositories/` | Firestore CRUD, queries, transactions |

**Forbidden:**

- Firestore imports in React components (except auth state listener in provider)
- Profit/inventory calculations in components
- Direct `doc()` / `collection()` calls outside repositories

### 3.2 Server vs Client

| Use Server | Use Client |
|---|---|
| Data mutations with secrets | Interactive forms |
| Initial data fetch for static pages | Real-time listeners (inventory, dashboard) |
| Firebase Admin operations | Browser-only APIs (print, file pick) |
| Aggregation for reports | Optimistic UI updates |

**Default:** Server Components for pages; Client Components only when interactivity requires it. Mark client components with `'use client'`.

### 3.3 Business Logic Location

| Logic Type | Location |
|---|---|
| Schema validation | `src/lib/domain/schemas/` (Zod) |
| Pure calculations (profit, WAC, recipe scaling) | `src/lib/domain/calculations/` |
| Workflow orchestration (production → inventory) | `src/lib/services/` |
| Firestore transactions | `src/lib/repositories/` calling services |

---

## 4. TypeScript Rules

```json
// tsconfig.json expectations
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

| Rule | Detail |
|---|---|
| Strict mode | Always enabled |
| No `any` | Use proper types or `unknown` |
| No `@ts-ignore` | Fix the type error; `@ts-expect-error` only with comment explaining why |
| Exported functions | Must have explicit return types when not inferred trivially |
| Enums | Prefer `as const` objects over TypeScript enums |
| IDs | Branded types or typed aliases: `type OrganizationId = string` |
| Dates | Store as Firestore `Timestamp`; convert at boundaries via `src/lib/utils/dates.ts` |
| Money | Store as integer minor units (`Paise` type alias); format via `src/lib/utils/money.ts` |

---

## 5. Firebase Rules

### 5.1 Authentication

- Email/password auth for v1.
- Google sign-in optional Phase 2.
- Every authenticated user must have an `organizationId` claim or membership document before accessing business data.
- New user signup creates org OR joins via invite — **never** orphan users with no org.

### 5.2 Firestore

- All business collections scoped under `organizations/{orgId}/...` **or** include `organizationId` field with security rule validation.
- Use **batched writes** or **transactions** for multi-document updates (production + inventory movements).
- Prefer **soft delete** with `deletedAt` field; filter in queries.
- Create composite indexes before deploying queries that need them — document in `.docs/DATABASE.md`.

### 5.3 Security Rules

- Security rules are the **last line of defense**, not the only line.
- Application layer must also enforce role checks.
- Never rely on client-side-only authorization.

### 5.4 Storage

- Path pattern: `organizations/{orgId}/{entityType}/{entityId}/{filename}`
- Validate file type and size server-side before upload.
- Max file size: 5 MB for receipts/images in v1.

---

## 6. UI & Component Rules

See `.docs/UI_GUIDELINES.md` for full detail. Summary:

- Use **shadcn/ui** components — do not import other UI libraries.
- Use **React Hook Form + Zod** for all forms.
- Every data page must handle: **loading**, **empty**, **error**, **success** states.
- Destructive actions require confirmation dialog.
- Toast notifications for mutation success/failure (sonner via shadcn).

---

## 7. State Management Rules

| State Type | Tool |
|---|---|
| Server/async data | TanStack Query |
| Form state | React Hook Form |
| Global auth/user | React Context or Zustand (minimal) |
| URL-filterable state | `searchParams` (date filters, pagination) |
| Real-time inventory | Firestore `onSnapshot` wrapped in custom hook |

**Avoid:** Redux, unnecessary global state, prop drilling beyond 2 levels (use composition or context).

---

## 8. Error Handling Rules

### 8.1 Error Types

```typescript
// Domain errors — predictable business failures
class DomainError extends Error {
  constructor(
    message: string,
    public code: string, // e.g., 'INSUFFICIENT_STOCK'
    public details?: Record<string, unknown>
  ) {}
}
```

### 8.2 Handling Pattern

| Layer | Behavior |
|---|---|
| Service | Throw `DomainError` for business rule violations |
| Server Action / API | Catch, map to user-friendly message, log full error |
| UI | Display toast or inline error; never expose stack traces |

### 8.3 Logging

- Log errors with context: `orgId`, `userId`, `operation`, `entityId`.
- No PII in logs beyond user ID.
- Production: structured JSON logs (Vercel/server).

---

## 9. Testing Rules

| Type | Requirement |
|---|---|
| Unit tests | Required for all calculation functions (profit, WAC, recipe scaling) |
| Integration tests | Required for inventory movement workflows |
| E2E tests | Phase 2 — Playwright |
| Manual test plan | Required per module before owner sign-off |

**Test file location:** Co-located `*.test.ts` or `src/__tests__/` mirror.

**Minimum coverage target for domain layer:** 90%.

---

## 10. Git & Code Review Rules

| Rule | Detail |
|---|---|
| Branch naming | `feature/module-name-short-description`, `fix/issue-description` |
| Commit messages | Conventional commits: `feat(products): add product list page` |
| PR size | One module or sub-feature per PR — small and reviewable |
| No direct commits to `main` | All changes via PR |
| AI sessions | Summarize what changed and what to test before requesting approval |

---

## 11. Performance Rules

| Rule | Target |
|---|---|
| Page load (LCP) | < 2.5s on 4G |
| Dashboard data fetch | < 2s for 1 year of data |
| List pages | Paginated — 25 items default |
| Firestore reads | Minimize — use aggregation queries, denormalized daily summaries |
| Bundle size | Dynamic import for charts (Recharts) |
| Images | Next.js Image component; WebP preferred |

---

## 12. Security Rules

- Validate all inputs with Zod on server — **never trust client validation alone**.
- Sanitize user-generated text before display (XSS prevention).
- Rate limit auth endpoints (Firebase built-in + Vercel).
- CSP headers configured in `next.config.ts`.
- Role checks on every mutation.
- Audit fields on every write.

---

## 13. Documentation Rules

| Event | Action |
|---|---|
| New module started | Read `.docs/BUSINESS.md` module section |
| Schema change | Update `.docs/DATABASE.md` in same PR |
| New business rule discovered | Update `.docs/BUSINESS.md` with owner approval |
| Architecture decision | Add ADR note to PR description or `.docs/adr/` |
| Assumption made | Document in PR and flag to owner |

---

## 14. AI Session Protocol

Every AI coding session **must** follow this workflow:

```
1. READ  → .docs/BUSINESS.md (relevant module)
           .docs/RULES.md (this file)
           .docs/DATABASE.md (relevant collections)
           .docs/TECH_STACK.md (patterns)
           .docs/UI_GUIDELINES.md (if UI work)

2. PLAN  → Explain approach and architectural decisions to owner
           Wait for approval on significant changes

3. BUILD → One module or sub-feature only
           Follow layer separation
           No placeholders

4. VERIFY → Run linter, type check, manual test plan
            Update documentation if schema changed

5. STOP  → Summarize changes, list what to test, wait for owner approval
```

### 14.1 What AI Must NOT Do

- Implement multiple modules in one session without explicit owner request
- Add npm packages without stating why
- Refactor unrelated code while implementing a feature
- Change business rules without updating `.docs/BUSINESS.md`
- Skip Firestore security rules
- Generate mock/demo data committed to repo

### 14.2 What AI Must Always Do

- Use existing patterns from the codebase once established
- Create reusable components when pattern appears 2+ times
- Include loading/empty/error states
- Scope all data to organization
- Write explicit TypeScript types
- Explain decisions before coding significant architecture

---

## 15. File & Naming Conventions

```
src/
├── app/                          # Next.js App Router
│   └── (dashboard)/
│       └── products/
│           ├── page.tsx
│           ├── [id]/page.tsx
│           └── new/page.tsx
├── components/
│   ├── ui/                       # shadcn primitives
│   ├── shared/                   # cross-module components
│   └── products/                 # module-specific components
├── lib/
│   ├── domain/
│   │   ├── schemas/
│   │   ├── calculations/
│   │   └── types/
│   ├── services/
│   ├── repositories/
│   └── utils/
└── hooks/
```

| Item | Convention |
|---|---|
| Components | PascalCase: `ProductForm.tsx` |
| Hooks | camelCase with `use` prefix: `useProducts.ts` |
| Services | camelCase: `productionService.ts` |
| Schemas | camelCase with `Schema` suffix: `productSchema.ts` |
| Constants | SCREAMING_SNAKE_CASE in dedicated files |
| Routes | kebab-case: `/raw-materials`, `/daily-production` |

---

## 16. Dependency Management

- **Prefer** existing stack components over new libraries.
- **New dependency criteria:** Solves problem not reasonably solvable in ~50 lines; actively maintained; TypeScript support; compatible with Next.js App Router.
- **Forbidden without approval:** ORMs, alternative UI libraries, alternative state managers, CSS-in-JS libraries (use Tailwind).

---

## 17. Environment & Configuration

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_FIREBASE_*` | Client Firebase config |
| `FIREBASE_ADMIN_*` | Server-side admin SDK |
| `NEXT_PUBLIC_APP_URL` | App base URL |

- All env vars documented in `.env.example` (no values).
- Never access `process.env` in client components except `NEXT_PUBLIC_*`.

---

*These rules are mandatory. When in doubt, stop and ask the product owner.*
