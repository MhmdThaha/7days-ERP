# 7Days Bakery ERP — Database Schema

> **Document purpose:** Definitive Firestore schema, relationships, indexes, security model, and data conventions. All repositories must conform to this document.

**Version:** 1.0  
**Last updated:** 2026-07-07  
**Database:** Google Cloud Firestore (Native mode)

---

## 1. Design Principles

| Principle | Implementation |
|---|---|
| Multi-tenancy | All business data scoped to `organizationId` |
| Denormalization | Acceptable for read performance (summary docs, cached names) |
| Append-only ledger | Inventory movements never updated/deleted |
| Soft delete | `deletedAt` timestamp on masters and transactions |
| Audit trail | `createdAt/By`, `updatedAt/By` on all documents |
| Atomic writes | Firestore transactions for inventory-affecting operations |
| Integer money | All amounts in minor currency units (paise) |
| UTC storage | Timestamps in UTC; business dates as `YYYY-MM-DD` strings |

---

## 2. Collection Hierarchy

```
firestore/
├── users/                                    # Global user profiles
│   └── {userId}
├── organizations/
│   └── {orgId}
│       ├── members/
│       │   └── {userId}
│       ├── settings                              # Single doc: 'config'
│       ├── products/
│       │   └── {productId}
│       ├── rawMaterials/
│       │   └── {rawMaterialId}
│       ├── recipes/
│       │   └── {recipeId}
│       ├── purchases/
│       │   └── {purchaseId}
│       ├── production/
│       │   └── {productionId}
│       ├── sales/
│       │   └── {salesId}
│       ├── expenses/
│       │   └── {expenseId}
│       ├── wastage/
│       │   └── {wastageId}
│       ├── inventory/
│       │   ├── balances/
│       │   │   └── {itemKey}                     # itemKey = type_id
│       │   └── movements/
│       │       └── {movementId}
│       ├── dailySummaries/
│       │   └── {dateKey}                         # YYYY-MM-DD
│       └── monthlySummaries/
│           └── {monthKey}                        # YYYY-MM
└── invites/                                      # Optional: org invite tokens
    └── {inviteId}
```

**Alternative considered:** Subcollections vs root-level with `organizationId` field.  
**Decision:** Nested under `organizations/{orgId}/` for natural security rule scoping and data isolation.

---

## 3. Shared Field Conventions

All documents include these fields unless noted:

```typescript
interface BaseDocument {
  id: string;
  organizationId: string;
  createdAt: Timestamp;
  createdBy: string;        // userId
  updatedAt: Timestamp;
  updatedBy: string;
  deletedAt: Timestamp | null;
  deletedBy: string | null;
}
```

Business date fields use **string** format `YYYY-MM-DD` (org timezone determined at write time).

Money fields use **integer** (minor units).

---

## 4. Collection Schemas

### 4.1 `users/{userId}`

Global user profile linked to Firebase Auth UID.

```typescript
interface User {
  id: string;                    // Same as Firebase Auth UID
  email: string;
  displayName: string;
  photoUrl: string | null;
  organizationId: string;        // Primary org (v1: only one)
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

### 4.2 `organizations/{orgId}`

```typescript
interface Organization {
  id: string;
  name: string;
  slug: string;                  // URL-safe unique identifier
  ownerId: string;               // userId
  currency: string;              // ISO 4217: 'INR'
  locale: string;                // 'en-IN'
  timezone: string;              // IANA: 'Asia/Kolkata'
  fiscalYearStartMonth: number;  // 1-12 (default 4 for April in India)
  dayCloseEnabled: boolean;
  taxInclusive: boolean;
  logoUrl: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

### 4.3 `organizations/{orgId}/members/{userId}`

```typescript
type MemberRole = 'owner' | 'manager' | 'production' | 'sales' | 'store';

interface OrganizationMember {
  id: string;                    // userId
  organizationId: string;
  userId: string;
  role: MemberRole;
  displayName: string;
  email: string;
  isActive: boolean;
  invitedAt: Timestamp | null;
  joinedAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

### 4.4 `organizations/{orgId}/settings/config`

Single document for org-level configuration.

```typescript
interface OrganizationSettings {
  id: 'config';
  organizationId: string;
  productCategories: string[];     // ['Bread', 'Pastry', 'Cake', ...]
  expenseCategories: string[];
  salesChannels: string[];       // ['counter', 'wholesale', 'delivery']
  paymentMethods: string[];
  units: string[];               // ['piece', 'kg', 'g', 'dozen', 'tray']
  wastageReasons: string[];
  lowStockAlertEnabled: boolean;
  blockSaleOnInsufficientStock: boolean;   // default false
  blockProductionOnInsufficientStock: boolean; // default false
  updatedAt: Timestamp;
  updatedBy: string;
}
```

---

### 4.5 `organizations/{orgId}/products/{productId}`

```typescript
interface Product {
  id: string;
  organizationId: string;
  code: string;                  // Unique per org
  name: string;
  category: string;
  unit: string;
  sellingPrice: number;          // Minor units (paise)
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
  activeRecipeId: string | null;
  // Denormalized for list views
  currentStock: number;          // Updated by inventory service
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
  deletedAt: Timestamp | null;
  deletedBy: string | null;
}
```

**Indexes:**

- `(organizationId, isActive, name)` — product picker
- `(organizationId, category, name)` — filtered lists
- `(organizationId, code)` — unique lookup

---

### 4.6 `organizations/{orgId}/rawMaterials/{rawMaterialId}`

```typescript
interface RawMaterial {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  category: string;              // e.g., 'Flour', 'Dairy', 'Packaging'
  unit: string;
  reorderLevel: number | null;   // Alert threshold
  description: string | null;
  isActive: boolean;
  // Denormalized
  currentStock: number;
  averageCost: number;           // WAC in minor units per unit
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
  deletedAt: Timestamp | null;
  deletedBy: string | null;
}
```

---

### 4.7 `organizations/{orgId}/recipes/{recipeId}`

```typescript
interface RecipeIngredient {
  rawMaterialId: string;
  rawMaterialName: string;       // Snapshot for display
  quantity: number;
  unit: string;
}

interface Recipe {
  id: string;
  organizationId: string;
  productId: string;
  productName: string;           // Snapshot
  version: number;               // Incremented on each new version
  isActive: boolean;             // Only one active per product
  yieldQuantity: number;
  yieldUnit: string;
  ingredients: RecipeIngredient[];
  laborCost: number;             // Minor units, per yield batch
  totalMaterialCost: number;     // Computed at save from WAC — informational
  unitCost: number;              // totalCost / yieldQuantity — informational
  notes: string | null;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
  deletedAt: Timestamp | null;
  deletedBy: string | null;
}
```

**Business rule:** Creating a new recipe version deactivates the previous active recipe for the same product.

**Indexes:**

- `(organizationId, productId, isActive)`
- `(organizationId, isActive, productName)`

---

### 4.8 `organizations/{orgId}/purchases/{purchaseId}`

```typescript
interface PurchaseLineItem {
  id: string;                    // Line item UUID
  rawMaterialId: string;
  rawMaterialName: string;       // Snapshot
  quantity: number;
  unit: string;
  unitCost: number;              // Minor units
  lineTotal: number;             // quantity × unitCost
}

interface Purchase {
  id: string;
  organizationId: string;
  purchaseDate: string;          // YYYY-MM-DD
  supplierName: string;
  invoiceNumber: string | null;
  lineItems: PurchaseLineItem[];
  totalAmount: number;
  paymentStatus: 'paid' | 'credit';
  notes: string | null;
  isDayClosed: boolean;          // Denormalized from day close status
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
  deletedAt: Timestamp | null;
  deletedBy: string | null;
}
```

**Indexes:**

- `(organizationId, purchaseDate DESC)`
- `(organizationId, purchaseDate, deletedAt)`

---

### 4.9 `organizations/{orgId}/production/{productionId}`

```typescript
interface ProductionLine {
  id: string;
  productId: string;
  productName: string;           // Snapshot
  quantity: number;
  unit: string;
  recipeId: string;              // Recipe used
  recipeVersion: number;
  unitCost: number;              // Recipe unit cost at production time
  totalCost: number;             // quantity × unitCost
  materialBreakdown: {           // Snapshot of materials consumed
    rawMaterialId: string;
    rawMaterialName: string;
    quantity: number;
    unit: string;
    cost: number;
  }[];
}

interface ProductionEntry {
  id: string;
  organizationId: string;
  productionDate: string;
  shift: 'morning' | 'evening' | 'night' | null;
  lines: ProductionLine[];
  totalUnits: number;            // Sum of line quantities
  totalCost: number;
  notes: string | null;
  isDayClosed: boolean;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
  deletedAt: Timestamp | null;
  deletedBy: string | null;
}
```

**Indexes:**

- `(organizationId, productionDate DESC)`
- `(organizationId, productionDate, deletedAt)`

---

### 4.10 `organizations/{orgId}/sales/{salesId}`

```typescript
interface SalesLine {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;             // Snapshotted selling price
  discount: number;              // Minor units
  lineTotal: number;             // (quantity × unitPrice) - discount
  unitCost: number;              // WAC at time of sale
  cogs: number;                  // quantity × unitCost
}

interface SalesEntry {
  id: string;
  organizationId: string;
  salesDate: string;
  channel: string;
  paymentMethod: string;
  customerName: string | null;
  lines: SalesLine[];
  grossTotal: number;
  totalDiscount: number;
  netTotal: number;
  totalCogs: number;
  notes: string | null;
  isDayClosed: boolean;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
  deletedAt: Timestamp | null;
  deletedBy: string | null;
}
```

**Indexes:**

- `(organizationId, salesDate DESC)`
- `(organizationId, salesDate, deletedAt)`
- `(organizationId, salesDate, channel)`

---

### 4.11 `organizations/{orgId}/expenses/{expenseId}`

```typescript
interface Expense {
  id: string;
  organizationId: string;
  expenseDate: string;
  category: string;
  amount: number;
  description: string;
  paymentMethod: string | null;
  receiptUrl: string | null;
  isDayClosed: boolean;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
  deletedAt: Timestamp | null;
  deletedBy: string | null;
}
```

**Indexes:**

- `(organizationId, expenseDate DESC)`
- `(organizationId, expenseDate, category)`

---

### 4.12 `organizations/{orgId}/wastage/{wastageId}`

```typescript
type WastageItemType = 'raw_material' | 'finished_product';

interface WastageEntry {
  id: string;
  organizationId: string;
  wastageDate: string;
  itemType: WastageItemType;
  itemId: string;                // rawMaterialId or productId
  itemName: string;              // Snapshot
  quantity: number;
  unit: string;
  reason: string;
  unitCost: number;              // WAC at time
  estimatedCost: number;         // quantity × unitCost
  notes: string | null;
  isDayClosed: boolean;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
  deletedAt: Timestamp | null;
  deletedBy: string | null;
}
```

**Indexes:**

- `(organizationId, wastageDate DESC)`
- `(organizationId, wastageDate, itemType)`

---

### 4.13 `organizations/{orgId}/inventory/balances/{itemKey}`

`itemKey` format: `{itemType}_{itemId}` e.g., `raw_abc123`, `product_xyz789`

```typescript
type InventoryItemType = 'raw_material' | 'finished_product';

interface InventoryBalance {
  id: string;                    // itemKey
  organizationId: string;
  itemType: InventoryItemType;
  itemId: string;
  itemName: string;              // Denormalized
  unit: string;
  quantity: number;              // Can be negative (flagged)
  averageCost: number;           // WAC in minor units
  totalValue: number;            // quantity × averageCost
  reorderLevel: number | null;   // From raw material (null for products)
  isLowStock: boolean;           // Computed
  isNegative: boolean;           // quantity < 0
  lastMovementAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Indexes:**

- `(organizationId, itemType, itemName)`
- `(organizationId, isLowStock)` — alert queries
- `(organizationId, isNegative)`

---

### 4.14 `organizations/{orgId}/inventory/movements/{movementId}`

**Append-only.** Never update or delete.

```typescript
type MovementType =
  | 'PURCHASE_IN'
  | 'PRODUCTION_RAW_OUT'
  | 'PRODUCTION_FINISHED_IN'
  | 'SALE_OUT'
  | 'WASTAGE_OUT'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'OPENING_BALANCE'
  | 'REVERSAL';

interface InventoryMovement {
  id: string;
  organizationId: string;
  movementDate: string;          // YYYY-MM-DD
  itemType: InventoryItemType;
  itemId: string;
  itemName: string;
  movementType: MovementType;
  quantity: number;              // Always positive; direction implied by type
  unit: string;
  unitCost: number;              // Cost at time of movement
  totalCost: number;
  balanceAfter: number;          // Quantity after this movement
  averageCostAfter: number;      // WAC after this movement
  sourceDocumentType: string;    // 'purchase' | 'production' | 'sales' | 'wastage' | 'adjustment'
  sourceDocumentId: string;
  sourceLineId: string | null;
  reversalOfMovementId: string | null;
  notes: string | null;
  createdAt: Timestamp;
  createdBy: string;
}
```

**Indexes:**

- `(organizationId, itemId, createdAt DESC)` — item ledger
- `(organizationId, movementDate DESC)` — daily ledger
- `(organizationId, sourceDocumentType, sourceDocumentId)` — traceability

---

### 4.15 `organizations/{orgId}/dailySummaries/{dateKey}`

Pre-computed aggregation. Updated on every transactional write affecting the date.

```typescript
interface ProductSummary {
  productId: string;
  productName: string;
  producedQty: number;
  soldQty: number;
  gap: number;                   // produced - sold
  revenue: number;
  cogs: number;
}

interface DailySummary {
  id: string;                    // YYYY-MM-DD
  organizationId: string;
  summaryDate: string;
  isClosed: boolean;
  closedAt: Timestamp | null;
  closedBy: string | null;

  // Production
  totalProductionUnits: number;
  totalProductionCost: number;

  // Sales
  totalSalesRevenue: number;
  totalSalesDiscount: number;
  totalNetSales: number;
  totalCogs: number;
  transactionCount: number;

  // Purchases
  totalPurchases: number;

  // Expenses
  totalExpenses: number;
  expensesByCategory: Record<string, number>;

  // Wastage
  totalWastageCost: number;
  wastageCount: number;

  // Profit
  grossProfit: number;           // netSales - cogs
  netProfit: number;             // grossProfit - expenses - wastage

  // Top lists (top 5)
  topProductsByQuantity: ProductSummary[];
  topProductsByRevenue: ProductSummary[];

  // Metadata
  computedAt: Timestamp;
  version: number;               // Incremented on recalculation
}
```

**Indexes:**

- `(organizationId, summaryDate DESC)`

---

### 4.16 `organizations/{orgId}/monthlySummaries/{monthKey}`

`monthKey` format: `YYYY-MM`

```typescript
interface DailyTrendPoint {
  date: string;
  revenue: number;
  netProfit: number;
  productionUnits: number;
}

interface MonthlySummary {
  id: string;                    // YYYY-MM
  organizationId: string;
  month: string;
  year: number;
  monthNumber: number;

  totalRevenue: number;
  totalPurchases: number;
  totalExpenses: number;
  totalWastageCost: number;
  totalCogs: number;
  grossProfit: number;
  netProfit: number;

  operatingDays: number;
  averageDailySales: number;
  averageDailyProfit: number;

  bestSellersByQuantity: ProductSummary[];
  bestSellersByRevenue: ProductSummary[];
  highestWastage: { itemName: string; cost: number }[];

  dailyTrend: DailyTrendPoint[];

  computedAt: Timestamp;
  version: number;
}
```

---

## 5. Entity Relationship Diagram

```
Organization
    │
    ├── Members (Users)
    ├── Settings
    │
    ├── Products ◄──────────────┐
    │       ▲                   │
    │       │ productId         │ productId
    ├── Recipes                 │
    │       │                   │
    │       │ rawMaterialId     │
    │       ▼                   │
    ├── RawMaterials            │
    │       ▲                   │
    │       │                   │
    ├── Purchases ──────────────┤
    ├── Production ─────────────┤
    ├── Sales ──────────────────┘
    ├── Expenses
    ├── Wastage
    │
    ├── Inventory
    │   ├── Balances (derived from movements)
    │   └── Movements (ledger)
    │
    ├── DailySummaries (derived)
    └── MonthlySummaries (derived)
```

---

## 6. Inventory Transaction Flow

### 6.1 Purchase

```
Transaction {
  1. Create/Update Purchase document
  2. For each line item:
     a. Create PURCHASE_IN movement
     b. Update raw material balance (qty ↑, WAC recalc)
     c. Update rawMaterials.currentStock, averageCost
  3. Recalculate dailySummary for purchaseDate
}
```

### 6.2 Production

```
Transaction {
  1. Create Production document (with recipe snapshot)
  2. For each line:
     a. For each recipe ingredient:
        - Create PRODUCTION_RAW_OUT movement
        - Update raw material balance (qty ↓)
     b. Create PRODUCTION_FINISHED_IN movement
     c. Update product balance (qty ↑, WAC recalc from recipe cost)
  3. Update denormalized currentStock on products/rawMaterials
  4. Recalculate dailySummary
}
```

### 6.3 Sales

```
Transaction {
  1. Create Sales document (with price + COGS snapshot)
  2. For each line:
     a. Create SALE_OUT movement
     b. Update product balance (qty ↓)
  3. Update product.currentStock
  4. Recalculate dailySummary
}
```

### 6.4 Edit/Delete (Reversal Pattern)

```
Transaction {
  1. Create REVERSAL movements for all original movements
  2. Restore balances to pre-transaction state
  3. Soft delete original document (or apply new version)
  4. If edit: create new document + new movements
  5. Recalculate dailySummary
}
```

---

## 7. Firestore Security Rules (Outline)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper functions
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

    // Users — own profile only
    match /users/{userId} {
      allow read, write: if isAuthenticated() && request.auth.uid == userId;
    }

    // Organization
    match /organizations/{orgId} {
      allow read: if isOrgMember(orgId);
      allow create: if isAuthenticated();
      allow update: if hasRole(orgId, ['owner', 'manager']);

      // Members
      match /members/{userId} {
        allow read: if isOrgMember(orgId);
        allow write: if hasRole(orgId, ['owner']);
      }

      // Settings
      match /settings/{docId} {
        allow read: if isOrgMember(orgId);
        allow write: if hasRole(orgId, ['owner', 'manager']);
      }

      // Masters — read all members, write owner/manager
      match /products/{productId} {
        allow read: if isOrgMember(orgId);
        allow write: if hasRole(orgId, ['owner', 'manager']);
      }

      match /rawMaterials/{materialId} {
        allow read: if isOrgMember(orgId);
        allow write: if hasRole(orgId, ['owner', 'manager']);
      }

      match /recipes/{recipeId} {
        allow read: if isOrgMember(orgId);
        allow write: if hasRole(orgId, ['owner', 'manager']);
      }

      // Transactions — role-based (simplified; app layer enforces finer control)
      match /purchases/{id} {
        allow read: if isOrgMember(orgId);
        allow write: if hasRole(orgId, ['owner', 'manager']);
      }

      match /production/{id} {
        allow read: if isOrgMember(orgId);
        allow write: if hasRole(orgId, ['owner', 'manager', 'production']);
      }

      match /sales/{id} {
        allow read: if isOrgMember(orgId);
        allow write: if hasRole(orgId, ['owner', 'manager', 'sales', 'store']);
      }

      match /expenses/{id} {
        allow read: if hasRole(orgId, ['owner', 'manager']);
        allow write: if hasRole(orgId, ['owner', 'manager']);
      }

      match /wastage/{id} {
        allow read: if isOrgMember(orgId);
        allow write: if hasRole(orgId, ['owner', 'manager', 'production', 'store']);
      }

      // Inventory — read all; writes via Admin SDK only (no client write)
      match /inventory/balances/{itemKey} {
        allow read: if isOrgMember(orgId);
        allow write: if false;
      }

      match /inventory/movements/{movementId} {
        allow read: if isOrgMember(orgId);
        allow write: if false;
      }

      // Summaries — read all; writes via Admin SDK only
      match /dailySummaries/{dateKey} {
        allow read: if isOrgMember(orgId);
        allow write: if false;
      }

      match /monthlySummaries/{monthKey} {
        allow read: if isOrgMember(orgId);
        allow write: if false;
      }
    }
  }
}
```

**Critical:** Inventory and summary writes go through **Firebase Admin SDK** in Server Actions — client writes are blocked by rules.

---

## 8. Composite Indexes

Document in `firebase/firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "products",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "organizationId", "order": "ASCENDING" },
        { "fieldPath": "isActive", "order": "ASCENDING" },
        { "fieldPath": "name", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "purchases",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "organizationId", "order": "ASCENDING" },
        { "fieldPath": "purchaseDate", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "production",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "organizationId", "order": "ASCENDING" },
        { "fieldPath": "productionDate", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "sales",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "organizationId", "order": "ASCENDING" },
        { "fieldPath": "salesDate", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "movements",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "organizationId", "order": "ASCENDING" },
        { "fieldPath": "itemId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "balances",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "organizationId", "order": "ASCENDING" },
        { "fieldPath": "isLowStock", "order": "ASCENDING" },
        { "fieldPath": "itemName", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

Add indexes as new query patterns emerge — never deploy queries without required indexes.

---

## 9. Storage Paths

```
organizations/{orgId}/
  logo.{ext}
  products/{productId}/image.{ext}
  expenses/{expenseId}/receipt.{ext}
```

**Max size:** 5 MB  
**Allowed types:** `image/jpeg`, `image/png`, `image/webp`, `application/pdf`

---

## 10. Data Migration & Seeding

| Scenario | Approach |
|---|---|
| New org setup | Onboarding wizard creates settings, optional opening balances |
| Excel import | Phase 2 — CSV import scripts per entity |
| Schema migration | Version field on documents; migration scripts in `scripts/migrations/` |
| Test data | Local emulator seed script — never commit production data |

---

## 11. Backup & Recovery

- Firestore automated daily backups (enable in Firebase Console for production)
- Export to Cloud Storage before major schema changes
- Recovery procedure documented in runbook (Phase 2)

---

## 12. Query Patterns Reference

| UI Screen | Query |
|---|---|
| Product list | `products where isActive=true orderBy name` |
| Product picker | `products where isActive=true orderBy name limit 50` |
| Today's sales | `sales where salesDate==today orderBy createdAt desc` |
| Inventory balances | `balances where itemType orderBy itemName` |
| Low stock | `balances where isLowStock==true orderBy itemName` |
| Item ledger | `movements where itemId==X orderBy createdAt desc limit 50` |
| Daily summary | `dailySummaries/{YYYY-MM-DD}` (single doc read) |
| Monthly trend | `dailySummaries where summaryDate between start/end` |
| Dashboard today | Single dailySummary doc + balances low stock query |

---

## 13. Known Limitations & Mitigations

| Limitation | Mitigation |
|---|---|
| No SQL joins | Denormalize names; accept staleness on display names |
| 500 writes per transaction | Batch large production entries; split if > 100 lines |
| Query inequality limits | Design queries with single inequality field |
| Collection group query costs | Scope queries to org subcollections |
| Real-time listener costs | Prefer TanStack Query polling for non-critical data |

---

*Update this document whenever a schema change is made. Schema changes require owner approval.*
