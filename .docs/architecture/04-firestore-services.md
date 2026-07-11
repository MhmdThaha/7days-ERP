# 04 — Firestore Services

> **Document purpose:** Data access layer design — repositories, business services, server actions, transactions, and cross-cutting Firestore patterns.

**Version:** 1.0  
**Last updated:** 2026-07-07  
**Status:** Draft — pending owner approval

**Related:** [DATABASE.md](../DATABASE.md) · [02-feature-dependencies.md](./02-feature-dependencies.md) · [07-security-auth.md](./07-security-auth.md)

---

## 1. Layer Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Server Actions (src/actions/)                          │
│  Auth check → Zod validate → call service → return      │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│  Services (src/lib/services/)                           │
│  Business workflows, orchestration, domain rules        │
└──────────┬──────────────────────────────┬───────────────┘
           │                              │
┌──────────▼──────────┐        ┌──────────▼──────────────┐
│  Repositories       │        │  Calculations           │
│  (src/lib/repositories/)     │  (src/lib/domain/       │
│  Firestore CRUD     │        │   calculations/)        │
└──────────┬──────────┘        └─────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────────┐
│  Firebase Admin SDK (mutations) / Client SDK (reads)      │
│  Cloud Firestore                                          │
└───────────────────────────────────────────────────────────┘
```

---

## 2. Repository Layer

### 2.1 Responsibilities

| Do | Don't |
|---|---|
| CRUD on single collection | Business logic |
| Build Firestore queries | Calculate WAC or profit |
| Run transactions (data ops) | Check user permissions |
| Convert Firestore ↔ domain types | Import React or Next.js |
| Accept `organizationId` on every call | Cross-org queries |

### 2.2 Base Repository

`base.repository.ts` provides:

- `getOrgCollection(orgId, subcollection)` — path builder
- `withConverter<T>()` — Timestamp and null handling
- `applySoftDeleteFilter(query)` — `where deletedAt == null`
- `buildAuditFields(userId, isCreate)` — createdAt/By, updatedAt/By
- `runTransaction(fn)` — wrapper around Admin SDK transaction

### 2.3 Repository Catalog

| Repository | Collection Path | Primary Operations |
|---|---|---|
| `organization.repository` | `organizations/{orgId}` | get, update |
| `member.repository` | `organizations/{orgId}/members/{userId}` | get, list, create, updateRole |
| `settings.repository` | `organizations/{orgId}/settings/config` | get, update |
| `product.repository` | `.../products/{id}` | list, get, create, update, softDelete |
| `rawMaterial.repository` | `.../rawMaterials/{id}` | list, get, create, update, softDelete |
| `recipe.repository` | `.../recipes/{id}` | list, get, create, deactivatePrevious, getActiveByProduct |
| `purchase.repository` | `.../purchases/{id}` | list, get, create, update, softDelete |
| `production.repository` | `.../production/{id}` | list, get, create, update, softDelete |
| `sales.repository` | `.../sales/{id}` | list, get, create, update, softDelete |
| `expense.repository` | `.../expenses/{id}` | list, get, create, update, softDelete |
| `wastage.repository` | `.../wastage/{id}` | list, get, create, update, softDelete |
| `inventory.repository` | `.../inventory/balances`, `.../movements` | getBalance, listBalances, createMovement, updateBalance, listMovements |
| `dailySummary.repository` | `.../dailySummaries/{date}` | get, upsert |
| `monthlySummary.repository` | `.../monthlySummaries/{month}` | get, upsert |
| `user.repository` | `users/{userId}` | get, create, update |

### 2.4 Read vs Write SDK

| Operation | SDK | Location |
|---|---|---|
| List/detail reads (client UI) | Client SDK | Repository methods called from hooks (browser) |
| Mutations (create/update/delete) | **Admin SDK** | Repository methods called from services (server only) |
| Session verification | Admin SDK | `auth-server.ts` |
| Custom claims | Admin SDK | `auth.service.ts` |

**Implementation note:** Maintain parallel repository access patterns — server repositories use `admin.ts`; client read helpers may wrap `client.ts` in hooks for direct Firestore reads, OR reads go through Server Components fetching via Admin SDK. **Recommended v1:** Client SDK for reads (with security rules); Admin SDK for all writes.

---

## 3. Service Layer

### 3.1 Responsibilities

| Do | Don't |
|---|---|
| Enforce business rules | Direct UI concerns |
| Orchestrate multi-document transactions | Render components |
| Call calculations (pure functions) | Raw Firestore path strings |
| Trigger summary recalculation | Skip permission checks (actions do auth, services do business authorization) |
| Throw `DomainError` with codes | Return generic Error |

### 3.2 Service Catalog

| Service | Key Methods | Calls |
|---|---|---|
| **auth.service** | `register`, `setCustomClaims`, `getMemberRole` | user.repo, member.repo, organization.repo |
| **organization.service** | `createOrg`, `updateSettings`, `getOrgContext` | organization.repo, settings.repo |
| **product.service** | `create`, `update`, `deactivate`, `list`, `generateCode` | product.repo |
| **rawMaterial.service** | `create`, `update`, `deactivate`, `list` | rawMaterial.repo |
| **recipe.service** | `createVersion`, `getActiveForProduct`, `calculateCost` | recipe.repo, rawMaterial.repo, calculations |
| **purchase.service** | `create`, `update`, `delete` | purchase.repo, **inventory.service**, **dailySummary.service** |
| **production.service** | `create`, `update`, `delete`, `buildMaterialBreakdown` | production.repo, recipe.repo, **inventory.service**, **dailySummary.service** |
| **sales.service** | `create`, `update`, `delete`, `computeLineCogs` | sales.repo, product.repo, **inventory.service**, **dailySummary.service** |
| **expense.service** | `create`, `update`, `delete` | expense.repo, storage.service, **dailySummary.service** |
| **wastage.service** | `create`, `update`, `delete` | wastage.repo, **inventory.service**, **dailySummary.service** |
| **inventory.service** | See Section 4 | inventory.repo, calculations/wac |
| **dailySummary.service** | `recalculate`, `closeDay`, `reopenDay`, `isDayClosed` | dailySummary.repo, all transaction repos (read) |
| **monthlySummary.service** | `recalculate` | monthlySummary.repo, dailySummary.repo |
| **storage.service** | `uploadFile`, `deleteFile`, `getPublicUrl` | Firebase Storage |

---

## 4. Inventory Service (Core)

Central service — most complex; built with Module 03.

### 4.1 Public API

| Method | Description |
|---|---|
| `recordPurchaseIn(orgId, line, purchaseId, date, userId)` | PURCHASE_IN movement + WAC update |
| `recordProduction(orgId, lines, productionId, date, userId)` | RAW OUT + FINISHED IN per line |
| `recordSaleOut(orgId, lines, salesId, date, userId)` | SALE_OUT per line |
| `recordWastageOut(orgId, entry, wastageId, date, userId)` | WASTAGE_OUT |
| `recordAdjustment(orgId, adjustment, userId)` | OPENING_BALANCE / ADJUSTMENT_IN/OUT |
| `reverseMovements(orgId, sourceDocType, sourceDocId, userId)` | Create REVERSAL movements for edit/delete |
| `getBalance(orgId, itemType, itemId)` | Current balance |
| `listLowStock(orgId, limit?)` | Balances where isLowStock |
| `listNegativeStock(orgId)` | Balances where isNegative |

### 4.2 Internal Flow (Purchase Example)

```
purchase.service.create()
  └── firestore.transaction:
        1. purchase.repository.create(doc)
        2. for each line:
             inventory.service.recordPurchaseIn()
               ├── inventory.repository.createMovement(PURCHASE_IN)
               ├── wac.calculateNewWac(existing, incoming)
               ├── inventory.repository.updateBalance(qty, avgCost)
               └── rawMaterial.repository.updateDenorm(stock, avgCost)
        3. dailySummary.service.recalculate(orgId, purchaseDate)
```

### 4.3 Movement Document Rules

- **Append-only** — never update or delete movements
- Reversals create new movement with `reversalOfMovementId` set
- Every movement records `balanceAfter` and `averageCostAfter` snapshot
- `itemKey` format: `raw_{id}` or `product_{id}`

### 4.4 WAC Calculation

Delegated to `lib/domain/calculations/wac.ts`:

```
calculateNewWac(existingQty, existingAvgCost, incomingQty, incomingUnitCost)
  → { newQty, newAvgCost }
```

Integer math only — all amounts in minor units.

---

## 5. Daily Summary Service

### 5.1 Recalculation Strategy

**Materialized document** — not computed on dashboard read.

```
dailySummary.service.recalculate(orgId, date)
  1. Query all non-deleted transactions for date (parallel reads)
  2. Run summary-aggregation.ts pure functions
  3. dailySummary.repository.upsert(computedDoc)
  4. monthlySummary.service.recalculate(orgId, monthOf(date))  // async, non-blocking
```

### 5.2 Incremental Implementation

| Module Added | Metrics Added to Recalculate |
|---|---|
| 03 Purchases | totalPurchases |
| 04 Production | totalProductionUnits, totalProductionCost |
| 05 Sales | totalNetSales, totalCogs, grossProfit, topProducts, transactionCount |
| 06 Expenses | totalExpenses, expensesByCategory |
| 07 Wastage | totalWastageCost, netProfit |
| 09 UI | day close/reopen flags |

### 5.3 Day Close

```
dailySummary.service.closeDay(orgId, date, userId)
  → verify !isClosed
  → set isClosed=true, closedAt, closedBy
  → (transaction modules check isDayClosed before mutate)

dailySummary.service.reopenDay(orgId, date, userId)
  → owner only
  → set isClosed=false
```

---

## 6. Server Actions Pattern

### 6.1 Action Result Type

```typescript
type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };
```

### 6.2 Action Wrapper

`lib/utils/action-result.ts`:

```
wrapAction(fn):
  1. try { authenticate → authorize → validate → execute → return success }
  2. catch DomainError → return { success: false, error, code }
  3. catch unknown → log + return generic error
```

### 6.3 Action → Service Mapping

| Action File | Exports |
|---|---|
| `actions/products.ts` | `createProduct`, `updateProduct`, `deactivateProduct`, `deleteProduct` |
| `actions/purchases.ts` | `createPurchase`, `updatePurchase`, `deletePurchase` |
| `actions/production.ts` | `createProduction`, `updateProduction`, `deleteProduction` |
| `actions/sales.ts` | `createSales`, `updateSales`, `deleteSales` |
| `actions/inventory.ts` | `createStockAdjustment` |
| `actions/summaries.ts` | `closeDay`, `reopenDay` |

**Reads** do not require server actions in v1 — TanStack Query hooks call client SDK or server-fetched data.

---

## 7. Firestore Transaction Boundaries

| Operation | Documents Touched | Max Ops Estimate |
|---|---|---|
| Create purchase (5 lines) | 1 purchase + 5 movements + 5 balances + 5 rawMaterial denorm + 1 summary | ~17 |
| Create production (3 products, 5 ingredients each) | 1 production + ~18 movements + ~18 balances + denorms + summary | ~40 |
| Create sale (5 lines) | 1 sales + 5 movements + 5 balances + denorms + summary | ~17 |
| Edit purchase | reversal (~N) + new (~N) + summary | ~2N + 1 |
| Delete production | soft delete + reversals + summary | ~2N + 1 |

**Firestore limit:** 500 operations per transaction. Batch large production entries if approaching limit (unlikely for single bakery).

### 7.1 Transaction Rules

1. All inventory-affecting writes in **single transaction**
2. Summary recalculation **inside** same transaction (preferred) or immediately after (acceptable if idempotent)
3. On failure: full rollback — no partial inventory state
4. Retry not automatic — user retries manually

---

## 8. Collection Path Helpers

`lib/firebase/paths.ts` — single source for path construction:

| Function | Returns |
|---|---|
| `orgPath(orgId)` | `organizations/{orgId}` |
| `productsPath(orgId)` | `organizations/{orgId}/products` |
| `inventoryBalancePath(orgId, itemKey)` | `.../inventory/balances/{itemKey}` |
| `dailySummaryPath(orgId, date)` | `.../dailySummaries/{date}` |
| `storageProductImagePath(orgId, productId, ext)` | Storage path |

**Never** hardcode collection path strings in services or components.

---

## 9. Type Converters

`lib/firebase/converters.ts`:

| Conversion | Rule |
|---|---|
| Firestore Timestamp → Date | At repository boundary |
| Date → business date string | `format(date, 'yyyy-MM-dd')` in org TZ |
| Money | Always integer in Firestore; never float |
| null vs undefined | Normalize to null for Firestore |
| Soft delete | `deletedAt: null` not omitted |

---

## 10. Query Patterns by Module

| Module | Query | Index Required |
|---|---|---|
| Product list | `where isActive, orderBy name, limit 25, startAfter cursor` | Yes |
| Purchases by date | `where purchaseDate == X, orderBy createdAt desc` | Yes |
| Sales by date range | `where salesDate >= start, purchaseDate <= end` | Yes |
| Low stock | `where isLowStock == true, orderBy itemName` | Yes |
| Item movements | `where itemId == X, orderBy createdAt desc, limit 50` | Yes |
| Daily summary | Single doc get `{date}` | None |
| Dashboard 30-day trend | `where summaryDate >= start, orderBy summaryDate asc, limit 30` | Yes |

---

## 11. Denormalization Strategy

| Field | Master Doc | Balance Doc | Updated By |
|---|---|---|---|
| `product.currentStock` | ✓ | `balance.quantity` | inventory.service |
| `rawMaterial.currentStock` | ✓ | `balance.quantity` | inventory.service |
| `rawMaterial.averageCost` | ✓ | `balance.averageCost` | inventory.service |
| `product.activeRecipeId` | ✓ | — | recipe.service |
| Transaction line `productName` | — | snapshot on write | respective service |
| `dailySummary.netProfit` | summary doc | — | dailySummary.service |

**Source of truth:** Inventory balance doc + movement ledger. Master denorm is cache for list performance.

---

## 12. Error Codes (DomainError)

| Code | Module | Meaning |
|---|---|---|
| `INSUFFICIENT_STOCK` | Production, Sales | Stock below required (warn or block) |
| `DAY_CLOSED` | All transactional | Cannot mutate closed day |
| `NOT_FOUND` | All | Entity doesn't exist |
| `DUPLICATE_CODE` | Products, Raw Materials | Code already exists |
| `NO_ACTIVE_RECIPE` | Production | Product has no recipe |
| `UNAUTHORIZED` | All | Role cannot perform action |
| `VALIDATION_ERROR` | All | Zod validation failed |
| `TRANSACTION_FAILED` | Inventory writers | Firestore transaction rollback |

---

## 13. Testing Strategy for Services

| Service | Test Type | Priority |
|---|---|---|
| `calculations/wac.ts` | Unit | P0 |
| `calculations/recipe-scaling.ts` | Unit | P0 |
| `calculations/profit.ts` | Unit | P0 |
| `calculations/summary-aggregation.ts` | Unit | P0 |
| `inventory.service` | Integration (Firestore emulator) | P0 |
| `purchase.service` | Integration | P1 |
| `production.service` | Integration | P1 |
| `dailySummary.service` | Unit + integration | P1 |

Use Firebase Emulator Suite for integration tests — never test against production Firestore.

---

## 14. Service Implementation Order

```
Phase 0:  organization.service, auth.service
Module 01: product.service
Module 02: rawMaterial.service, recipe.service
Module 03: inventory.service ★, purchase.service, dailySummary.service (partial)
Module 04: production.service, dailySummary.service (expand)
Module 05: sales.service, dailySummary.service (expand)
Module 06: expense.service, dailySummary.service (expand)
Module 07: wastage.service, dailySummary.service (complete)
Module 08: (uses existing inventory.service — adjustment method only)
Module 09: dailySummary.service (day close)
Module 10: monthlySummary.service
Module 11: (read-only — no new services)
```

---

*All Firestore schema details in [DATABASE.md](../DATABASE.md). Security enforcement in [07-security-auth.md](./07-security-auth.md).*
