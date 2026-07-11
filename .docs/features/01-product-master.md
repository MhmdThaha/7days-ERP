# Feature Specification: Product Master

> **Module:** 01 — Product Master  
> **Version:** 1.0  
> **Last updated:** 2026-07-07  
> **Status:** Draft — pending owner approval  
> **Dependencies:** Phase 0 Foundation (Auth, Org, Settings)  
> **Dependents:** Recipe Master, Production, Sales, Inventory, Daily Summary, Dashboard

**Related docs:** [BUSINESS.md](../BUSINESS.md) · [DATABASE.md](../DATABASE.md) · [UI_GUIDELINES.md](../UI_GUIDELINES.md)

---

## 1. Purpose

Product Master is the canonical catalog of all **finished goods** the bakery produces and sells. It defines the identity, classification, default selling price, and unit of measure for every item that flows through production, sales, inventory, and reporting.

Without Product Master, no other operational module can function. It is the first business module to be implemented after foundation setup.

---

## 2. Business Goal

- Maintain a single, authoritative list of all bakery products.
- Enable fast product selection during production and sales entry.
- Provide default pricing that staff can override at point of sale.
- Support product lifecycle management (active/inactive) without losing historical data.
- Surface stock levels and recipe linkage status at a glance for managers.

**Success metric:** Owner and staff can find any product within 3 seconds; 100% of sales and production lines reference valid products.

---

## 3. Users

| Role | Access Level | Primary Actions |
|---|---|---|
| Owner | Full CRUD | Create, edit, deactivate, view all products |
| Manager | Full CRUD | Create, edit, deactivate, view all products |
| Production Staff | Read only | View active products for production entry |
| Sales Staff | Read only | View active products for sales entry |
| Store Staff | Read only | View active products for counter sales |

---

## 4. User Stories

### Owner / Manager

- **US-PM-01:** As an owner, I want to add a new product with name, category, unit, and selling price so that my team can record production and sales against it.
- **US-PM-02:** As a manager, I want to search and filter products by name, category, or code so that I can quickly find items in a large catalog.
- **US-PM-03:** As an owner, I want to deactivate a discontinued product so that it no longer appears in new transactions but historical records remain intact.
- **US-PM-04:** As a manager, I want to see current stock and recipe status on the product list so that I know which products are ready to sell and which need recipes.
- **US-PM-05:** As an owner, I want to upload a product image so that staff can visually identify items at the counter.
- **US-PM-06:** As a manager, I want to update a product's selling price so that future sales use the new default (without changing past sales).

### Production / Sales Staff

- **US-PM-07:** As production staff, I want to view the product list with only active items so that I don't accidentally select discontinued products.
- **US-PM-08:** As sales staff, I want products to appear in a searchable picker sorted by name so that I can record sales quickly.

---

## 5. Inputs

### 5.1 Create / Edit Product

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `code` | string | No | Auto-generated | Format: `PRD-001`; unique per org |
| `name` | string | Yes | — | Max 120 characters |
| `category` | string | Yes | — | From org settings product categories |
| `unit` | string | Yes | — | From org settings units list |
| `sellingPrice` | money | Yes | 0 | Minor units (paise); display as ₹ |
| `description` | string | No | null | Max 500 characters |
| `image` | file | No | null | JPEG/PNG/WebP; max 5 MB |
| `isActive` | boolean | Yes | true | — |

### 5.2 List Filters

| Filter | Type | Default |
|---|---|---|
| Search query | string | empty — matches name or code |
| Category | select | All |
| Status | select | Active only |
| Has recipe | boolean | All |

### 5.3 System-Generated (not user input)

| Field | Source |
|---|---|
| `organizationId` | Current user's org |
| `activeRecipeId` | Set when recipe is created (Recipe Master) |
| `currentStock` | Updated by inventory service |
| Audit fields | System on save |

---

## 6. Outputs

### 6.1 Product List View

- Paginated table of products with: thumbnail, code, name, category, unit, selling price, current stock, recipe badge, status badge.
- Filter and search results count.
- Empty state when no products exist.

### 6.2 Product Detail / Edit View

- Full product record with all fields.
- Read-only: current stock, average cost (from inventory), active recipe link.
- Edit history via audit fields (created/updated by and at).

### 6.3 Product Picker (consumed by other modules)

- Searchable combobox returning: `id`, `name`, `code`, `unit`, `sellingPrice`, `currentStock`.
- Used by Production, Sales modules.

### 6.4 Side Effects

- None on inventory — Product Master does not affect stock directly.
- Deactivating a product removes it from pickers in Production and Sales (active only).

---

## 7. Business Rules

| # | Rule |
|---|---|
| BR-PM-01 | A product must exist before it can appear in recipes, production, or sales. |
| BR-PM-02 | Product `code` must be unique within the organization. |
| BR-PM-03 | Deactivating a product does not delete it or alter historical transactions. |
| BR-PM-04 | Inactive products are hidden from new transaction pickers but visible in master list with filter. |
| BR-PM-05 | `sellingPrice` changes apply to future sales only — past sales retain snapshotted prices. |
| BR-PM-06 | Products without an active recipe can still be sold; system shows a warning badge "No Recipe". |
| BR-PM-07 | Products without a recipe cannot be recorded in production (production requires recipe). |
| BR-PM-08 | Soft delete only — `deletedAt` set; product never hard-deleted if transactions exist. |
| BR-PM-09 | If transactions exist, product cannot be hard-deleted; deactivation is the correct action. |
| BR-PM-10 | `currentStock` on product document is denormalized from inventory — never edited via Product Master. |
| BR-PM-11 | Auto-generated code increments from highest existing code in org (e.g., PRD-001 → PRD-002). |

---

## 8. Validation Rules

| Field | Validation | Error Message |
|---|---|---|
| `name` | Required; 1–120 chars; trim whitespace | "Product name is required" / "Name must be 120 characters or less" |
| `name` | Unique per org (case-insensitive) | "A product with this name already exists" |
| `code` | Unique per org if provided | "Product code already in use" |
| `code` | Alphanumeric + hyphen only | "Code can only contain letters, numbers, and hyphens" |
| `category` | Must exist in org settings categories | "Invalid category" |
| `unit` | Must exist in org settings units | "Invalid unit" |
| `sellingPrice` | Integer ≥ 0 | "Selling price cannot be negative" |
| `description` | Max 500 chars | "Description is too long" |
| `image` | Max 5 MB; JPEG/PNG/WebP only | "Invalid file type or size" |
| Deactivate | Warn if product has stock > 0 | "This product has {qty} units in stock. Deactivate anyway?" |

**Server-side:** All validations re-run in Server Action regardless of client validation.

---

## 9. Firestore Collections Used

| Collection | Operation | Purpose |
|---|---|---|
| `organizations/{orgId}/products/{productId}` | CRUD | Product records |
| `organizations/{orgId}/settings/config` | Read | Categories and units lists |
| `organizations/{orgId}/recipes/{recipeId}` | Read | Check active recipe linkage |
| `organizations/{orgId}/inventory/balances/product_{productId}` | Read | Display current stock |
| Firebase Storage `organizations/{orgId}/products/{productId}/` | Write | Product images |

**Indexes required:**

- `(organizationId, isActive, name)` — list and picker
- `(organizationId, category, name)` — filtered list
- `(organizationId, code)` — unique lookup

---

## 10. UI Components

### Pages

| Route | Component | Description |
|---|---|---|
| `/products` | `ProductsPage` | List with filters |
| `/products/new` | `ProductCreatePage` | Create form |
| `/products/[id]` | `ProductDetailPage` | View/edit form |

### Shared Components (from UI_GUIDELINES)

| Component | Usage |
|---|---|
| `PageHeader` | Title + "Add Product" action |
| `DataTable` | Product list |
| `EmptyState` | No products yet |
| `ConfirmDialog` | Deactivate confirmation |
| `MoneyDisplay` | Selling price column |
| `MoneyInput` | Selling price field |
| `StatusBadge` | Active/Inactive, Has Recipe / No Recipe |
| `LoadingSkeleton` | Table loading state |

### Module-Specific Components

| Component | Description |
|---|---|
| `ProductForm` | Create/edit form with validation |
| `ProductFilters` | Search, category, status filters |
| `ProductImageUpload` | Drag-and-drop image upload |
| `ProductStockBadge` | Inline stock with color coding |
| `ProductCombobox` | Searchable picker for other modules |

### shadcn/ui Primitives

`Button`, `Input`, `Select`, `Form`, `Card`, `Badge`, `Dialog`, `DropdownMenu`, `Avatar` (thumbnail), `Switch` (active toggle), `Textarea`, `Skeleton`, `Toast`

---

## 11. Edge Cases

| # | Scenario | Expected Behavior |
|---|---|---|
| EC-PM-01 | Create product with duplicate name | Block save; show validation error |
| EC-PM-02 | Deactivate product with existing stock | Allow with confirmation warning |
| EC-PM-03 | Deactivate product referenced in today's open production | Allow; existing entries unaffected |
| EC-PM-04 | Delete product with historical sales | Soft delete blocked if hard delete attempted; guide user to deactivate |
| EC-PM-05 | Edit selling price mid-day | New price applies to next sale; earlier today sales unchanged |
| EC-PM-06 | Product with no recipe added to production | Block in production module (not product master) |
| EC-PM-07 | Upload image fails (network) | Show error toast; product saves without image |
| EC-PM-08 | Auto-code generation race condition | Server-side transaction ensures unique code |
| EC-PM-09 | 200+ products in list | Pagination works; search remains responsive (< 300ms debounce) |
| EC-PM-10 | Category removed from settings while products use it | Existing products retain category value; show in list; warn on edit to pick new category |
| EC-PM-11 | Org has zero products | Empty state with onboarding CTA |
| EC-PM-12 | User without write permission visits /products/new | Redirect or 403 with message |

---

## 12. Acceptance Criteria

### Functional

- [ ] Owner/Manager can create a product with all required fields.
- [ ] Product list displays with pagination (25 per page), search, and category filter.
- [ ] Product code auto-generates if left blank.
- [ ] Owner/Manager can edit all fields except `currentStock`.
- [ ] Owner/Manager can deactivate/reactivate a product via toggle with confirmation.
- [ ] Inactive products do not appear in Production or Sales pickers.
- [ ] Product image uploads to Firebase Storage and displays in list and detail.
- [ ] `sellingPrice` displays formatted as INR with 2 decimals.
- [ ] List shows current stock (from inventory) and recipe status badge.
- [ ] Production/Sales staff can view product list (read-only); create/edit/delete hidden.

### Non-Functional

- [ ] List page loads in < 1.5 seconds with 200 products.
- [ ] All form validations work client-side and server-side.
- [ ] Role permissions enforced in UI and Firestore security rules.
- [ ] Audit fields populated on create and update.
- [ ] No `any` types in implementation.

### Regression

- [ ] Creating a product does not affect inventory balances.
- [ ] Deactivating a product does not alter historical sales or production records.

---

## 13. Future Enhancements

| Priority | Enhancement |
|---|---|
| P2 | Product variants (size: small/large; same base product) |
| P2 | Barcode/SKU scanning for product lookup |
| P2 | Bulk import from CSV/Excel |
| P2 | Product margin analysis (selling price vs recipe cost) |
| P2 | Seasonal products with auto-activate/deactivate dates |
| P3 | Multi-price tiers (wholesale vs retail default) |
| P3 | Product bundles/combos |
| P3 | Nutritional info and allergen tags |
| P3 | Print product labels |

---

*Implementation must not begin until this specification and `.docs/BUSINESS.md` are approved by the product owner.*
