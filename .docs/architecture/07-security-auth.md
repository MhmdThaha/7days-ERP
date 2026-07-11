# 07 — Security & Authentication

> **Document purpose:** Authentication flows, session management, role-based access control, Firestore security rules strategy, and security best practices.

**Version:** 1.0  
**Last updated:** 2026-07-07  
**Status:** Draft — pending owner approval

**Related:** [DATABASE.md](../DATABASE.md) · [04-firestore-services.md](./04-firestore-services.md) · [05-routing-navigation.md](./05-routing-navigation.md)

---

## 1. Security Architecture Overview

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐
│   Browser    │────▶│  Middleware  │────▶│  Dashboard (RSC)     │
│ Firebase Auth│     │ Session check│     │  Server Actions      │
└──────┬───────┘     └──────────────┘     └──────────┬───────────┘
       │                                              │
       │ Client SDK reads                             │ Admin SDK writes
       ▼                                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    Cloud Firestore                            │
│              Security Rules (last line of defense)            │
└──────────────────────────────────────────────────────────────┘
```

**Defense in depth:**

1. **Middleware** — session exists
2. **Server Actions** — authenticate + authorize + validate
3. **Firestore Rules** — org isolation + role checks on client reads
4. **Admin SDK** — inventory/summary writes bypass client (rules block client writes)

---

## 2. Authentication

### 2.1 Auth Provider

**Firebase Authentication** — email/password for v1.

| Feature | v1 | Phase 2 |
|---|---|---|
| Email/password sign up | ✅ | |
| Email/password login | ✅ | |
| Email verification | ✅ Recommended | |
| Password reset email | ✅ | |
| Google OAuth | | ✅ |
| MFA | | ✅ |

### 2.2 Registration Flow

```
1. User submits: email, password, displayName, organizationName
2. Server Action: registerAction()
   a. Create Firebase Auth user (Admin SDK or client createUser)
   b. Create organizations/{orgId} document
   c. Create organizations/{orgId}/members/{userId} role: 'owner'
   d. Create users/{userId} profile with organizationId
   e. Create organizations/{orgId}/settings/config with defaults
   f. Set custom claims: { organizationId, role: 'owner' }
   g. Create session cookie
3. Redirect to /onboarding
```

**Atomicity:** Use batched write or transaction for org + member + settings + user profile. Auth user creation is separate (rollback strategy if Firestore fails).

### 2.3 Login Flow

```
1. Client: signInWithEmailAndPassword (Firebase client SDK)
2. Client: getIdToken()
3. Client: POST /api/auth/session { idToken }
4. Server: verifyIdToken(idToken) via Admin SDK
5. Server: createSessionCookie(idToken) → Set httpOnly cookie
6. Client: redirect to /
```

### 2.4 Session Management

| Aspect | Implementation |
|---|---|
| Cookie | httpOnly, secure (production), sameSite: 'lax' |
| Verification (middleware) | Decode session cookie — reject if invalid/expired |
| Verification (server action) | `getCurrentUser()` — full verify + load member |
| Logout | Client signOut + DELETE /api/auth/session |
| Token refresh | Firebase client SDK auto-refreshes; re-POST session on refresh optional |

### 2.5 getCurrentUser() (Server)

```typescript
// lib/firebase/auth-server.ts
interface AuthenticatedUser {
  uid: string;
  email: string;
  organizationId: string;
  role: MemberRole;
  member: OrganizationMember;
}

async function getCurrentUser(): Promise<AuthenticatedUser | null>
```

Called at start of every Server Action. Returns null → action returns `{ success: false, error: 'Unauthorized' }`.

---

## 3. Role-Based Access Control (RBAC)

### 3.1 Roles

| Role | Key | Description |
|---|---|---|
| Owner | `owner` | Full access; org settings; member management; reopen closed days |
| Manager | `manager` | Operational full access; day close; no member management |
| Production Staff | `production` | Production + wastage write (today); read masters |
| Sales Staff | `sales` | Sales write (today); read products |
| Store Staff | `store` | Sales + wastage write (today); limited read |

**v1:** Fixed roles — not customizable per org.

### 3.2 Permission Matrix

Defined in `lib/domain/permissions.ts` — single source of truth.

| Resource / Action | owner | manager | production | sales | store |
|---|---|---|---|---|---|
| **Products** | CRUD | CRUD | R | R | R |
| **Raw Materials** | CRUD | CRUD | R | — | — |
| **Recipes** | CRUD | CRUD | R | — | — |
| **Purchases** | CRUD | CRUD | R | — | — |
| **Production** | CRUD | CRUD | CRU (today) | R | R |
| **Sales** | CRUD | CRUD | R | CRU (today) | CRU (today) |
| **Expenses** | CRUD | CRUD | — | — | — |
| **Wastage** | CRUD | CRUD | CRU (today) | — | CRU (today) |
| **Inventory view** | R | R | R | R | R |
| **Stock adjustment** | ✅ | ✅ | — | — | — |
| **Daily Summary** | R + close | R + close | R | — | — |
| **Monthly Summary** | R | R | — | — | — |
| **Dashboard** | Full | Full | Limited | Limited | Limited |
| **Org settings** | ✅ | R | — | — | — |
| **Member management** | ✅ | — | — | — | — |
| **Reopen closed day** | ✅ | — | — | — | — |
| **Delete masters** | ✅ | ✅ | — | — | — |
| **Edit past dates** | ✅ | ✅ | — | — | — |

**Legend:** C=Create, R=Read, U=Update, D=Delete, ✅=allowed, —=denied

### 3.3 Permission Check API

```typescript
// lib/domain/permissions.ts
type Action = 'create' | 'read' | 'update' | 'delete' | 'closeDay' | 'reopenDay' | 'adjustStock';
type Resource = 'product' | 'rawMaterial' | 'recipe' | 'purchase' | 'production' | 'sales' | 'expense' | 'wastage' | 'inventory' | 'dailySummary' | 'monthlySummary' | 'settings' | 'members';

function can(role: MemberRole, action: Action, resource: Resource): boolean;

// Usage in Server Action:
if (!can(user.role, 'create', 'purchase')) {
  throw new DomainError('Unauthorized', 'UNAUTHORIZED');
}
```

### 3.4 Date-Scoped Permissions

Production, Sales, Store staff can only mutate **today's** transactions:

```typescript
function canMutateTransaction(
  role: MemberRole,
  resource: Resource,
  transactionDate: string,
  orgTimezone: string
): boolean {
  if (can(role, 'update', resource)) {
    if (role === 'owner' || role === 'manager') return true;
    return transactionDate === getOrgToday(orgTimezone);
  }
  return false;
}
```

Enforced in service layer, not just UI.

---

## 4. Multi-Tenant Isolation

### 4.1 Rules

1. Every Firestore document (except `users/{uid}` own profile) belongs to one `organizationId`
2. Users belong to one org in v1
3. All queries include org scope — never query across orgs
4. Server Actions derive `orgId` from authenticated user — **never from client input**
5. Client-provided `organizationId` in forms is ignored — use session orgId

### 4.2 Cross-Org Access Prevention

```typescript
// WRONG — never trust client orgId
async function getProduct(orgId: string, productId: string) { ... }

// CORRECT — orgId from authenticated session
async function getProduct(user: AuthenticatedUser, productId: string) {
  return productRepository.get(user.organizationId, productId);
}
```

---

## 5. Firestore Security Rules

### 5.1 Helper Functions

```javascript
function isAuthenticated() {
  return request.auth != null;
}

function isOrgMember(orgId) {
  return isAuthenticated() &&
    exists(/databases/$(database)/documents/organizations/$(orgId)/members/$(request.auth.uid));
}

function getMemberRole(orgId) {
  return get(/databases/$(database)/documents/organizations/$(orgId)/members/$(request.auth.uid)).data.role;
}

function hasRole(orgId, roles) {
  return isOrgMember(orgId) && getMemberRole(orgId) in roles;
}

function isNotDeleted() {
  return !('deletedAt' in resource.data) || resource.data.deletedAt == null;
}
```

### 5.2 Rules by Collection

| Collection | Read | Client Write |
|---|---|---|
| `users/{userId}` | Own profile only | Own profile only |
| `organizations/{orgId}` | Org members | owner, manager (update) |
| `members/{userId}` | Org members | owner only |
| `settings/config` | Org members | owner, manager |
| `products` | Org members | owner, manager |
| `rawMaterials` | Org members | owner, manager |
| `recipes` | Org members | owner, manager |
| `purchases` | Org members | owner, manager |
| `production` | Org members | owner, manager, production |
| `sales` | Org members | owner, manager, sales, store |
| `expenses` | owner, manager | owner, manager |
| `wastage` | Org members | owner, manager, production, store |
| `inventory/balances` | Org members | **false** (Admin SDK only) |
| `inventory/movements` | Org members | **false** (Admin SDK only) |
| `dailySummaries` | Org members | **false** (Admin SDK only) |
| `monthlySummaries` | Org members | **false** (Admin SDK only) |

### 5.3 Why Block Client Writes to Inventory/Summaries

- Inventory mutations require atomic multi-document transactions
- Client cannot be trusted to compute WAC correctly
- Admin SDK in Server Actions ensures integrity
- Rules `allow write: if false` — even if client SDK compromised, cannot write

### 5.4 Custom Claims (Optional Enhancement)

Sync role to Firebase Auth custom claims for rule shortcuts:

```javascript
// Alternative to get() call in rules — faster
function hasClaimRole(role) {
  return request.auth.token.role == role;
}
```

Claims synced on role change via Admin SDK — member doc remains source of truth.

---

## 6. Server Action Security Checklist

Every Server Action must:

```
☑ 1. Call getCurrentUser() — reject if null
☑ 2. Call can(role, action, resource) — reject if false
☑ 3. Validate input with Zod schema
☑ 4. Use user.organizationId (not input orgId)
☑ 5. For date-scoped roles: verify transaction date policy
☑ 6. For day close: verify !isDayClosed (if enabled)
☑ 7. Delegate to service layer (no direct Firestore in action)
☑ 8. Return ActionResult — never throw unhandled errors to client
☑ 9. Log errors server-side with context (no PII beyond userId)
☐ 10. Rate limit auth actions (optional Phase 2)
```

---

## 7. Input Validation & Sanitization

| Layer | Tool | Purpose |
|---|---|---|
| Client form | Zod + RHF | UX — immediate feedback |
| Server Action | Same Zod schema | Authoritative validation |
| Firestore rules | Type checks (limited) | Last resort |

**Rules:**

- Reuse identical Zod schemas on client and server
- Sanitize text fields: trim whitespace; max length enforced
- Money: validate integer, ≥ 0
- Dates: validate format and business rules (not future, not too old)
- File uploads: validate MIME type and size server-side before Storage upload
- No HTML in user inputs — React escapes on render (XSS prevention)

---

## 8. Firebase Storage Security

```javascript
// storage.rules
match /organizations/{orgId}/{allPaths=**} {
  allow read: if isOrgMember(orgId);
  allow write: if isOrgMember(orgId)
    && request.resource.size < 5 * 1024 * 1024
    && request.resource.contentType.matches('image/.*|application/pdf');
}
```

| Path | Max Size | Types |
|---|---|---|
| `organizations/{orgId}/products/{id}/` | 5 MB | image/* |
| `organizations/{orgId}/expenses/{id}/` | 5 MB | image/*, application/pdf |
| `organizations/{orgId}/logo.` | 2 MB | image/* |

Upload flow: Server Action validates → generates path → client uploads with auth OR server-side upload via Admin SDK.

---

## 9. Environment & Secrets

| Secret | Storage | Exposure |
|---|---|---|
| `FIREBASE_ADMIN_PRIVATE_KEY` | Vercel env (server) | Never client |
| `NEXT_PUBLIC_FIREBASE_*` | Vercel env (public) | Client — safe by design |
| Service account JSON | **Never in repo** | Env vars only |
| Session cookie secret | Firebase managed | httpOnly |

`.env.example` documents all vars without values. `.env.local` gitignored.

---

## 10. HTTP Security Headers

Configure in `next.config.ts`:

| Header | Value |
|---|---|
| `X-Frame-Options` | DENY |
| `X-Content-Type-Options` | nosniff |
| `Referrer-Policy` | strict-origin-when-cross-origin |
| `Content-Security-Policy` | Restrict script sources; allow Firebase domains |
| `Strict-Transport-Security` | max-age=31536000 (production) |

---

## 11. Audit Trail

All transactional documents include:

```typescript
createdAt, createdBy, updatedAt, updatedBy, deletedAt, deletedBy
```

Inventory movements additionally record:

```typescript
sourceDocumentType, sourceDocumentId, sourceLineId, createdBy
```

**Day close audit:** `closedAt`, `closedBy` on daily summary.

Audit fields set server-side from authenticated user — never from client input.

---

## 12. Threat Model (v1)

| Threat | Mitigation |
|---|---|
| Unauthenticated access | Middleware + session verification |
| Cross-org data access | orgId from session; rules enforce membership |
| Privilege escalation | Role from member doc; checked in every action |
| Client inventory tampering | Admin SDK writes; rules block client |
| XSS | React escaping; no dangerouslySetInnerHTML |
| CSRF | SameSite cookies; Server Actions POST |
| Secret exposure | Env vars; no secrets in client bundle |
| Mass data exfiltration | Firestore rules; pagination limits |
| Brute force login | Firebase Auth rate limiting |
| File upload abuse | Size/type validation; Storage rules |

---

## 13. Security Rules Rollout Schedule

| Phase | Rules Deployed |
|---|---|
| 0 | users, organizations, members, settings |
| 1 | products |
| 2 | rawMaterials, recipes |
| 3 | purchases + inventory (read-only writes blocked) |
| 4–7 | production, sales, expenses, wastage |
| 9 | dailySummaries, monthlySummaries |
| Storage | With Module 01 (images) and Module 06 (receipts) |

Deploy rules with each module — `firebase deploy --only firestore:rules`.

---

## 14. Security Testing Checklist

| Test | Method |
|---|---|
| Unauthenticated API/action rejected | Manual + integration test |
| Sales staff cannot create purchase | Action returns UNAUTHORIZED |
| User A cannot read Org B products | Rules emulator test |
| Client SDK cannot write to movements | Rules emulator test |
| Production staff cannot edit yesterday's production | Service layer test |
| Invalid Zod input rejected server-side | Unit test |
| Closed day blocks mutation | Integration test |
| File > 5MB rejected | Upload test |

Use Firebase Emulator Suite for rules testing in CI.

---

*Permission matrix must stay synchronized with [05-routing-navigation.md](./05-routing-navigation.md) nav filtering and feature spec role tables.*
