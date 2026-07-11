# Feature Specification: Recipe Master

> **Module:** 02 — Recipe Master (+ Raw Material Master)  
> **Version:** 1.0  
> **Last updated:** 2026-07-07  
> **Status:** Draft — pending owner approval  
> **Dependencies:** Product Master, Phase 0 Foundation  
> **Dependents:** Production, Inventory (cost basis), Daily Summary, Dashboard

**Related docs:** [BUSINESS.md](../BUSINESS.md) · [DATABASE.md](../DATABASE.md) · [UI_GUIDELINES.md](../UI_GUIDELINES.md)

**Note:** Raw Material Master is introduced as part of this module because recipes require raw materials to exist first. Raw materials have their own CRUD screens within this module scope.

---

## 1. Purpose

Recipe Master defines the **Bill of Materials (BOM)** for each finished product — how much of each raw material is consumed to produce a defined yield batch. It also includes **Raw Material Master**, the catalog of purchasable ingredients and supplies.

Together, these masters enable accurate raw material consumption on production, recipe-based cost calculation, and margin analysis.

---

## 2. Business Goal

- Define precise material requirements for every producible product.
- Calculate recipe cost dynamically from current raw material weighted average cost (WAC).
- Version recipes without corrupting historical production records.
- Maintain raw material catalog with reorder levels for low stock alerts.
- Enable production staff to understand material requirements before baking.

**Success metric:** 100% of production entries use a valid recipe snapshot; recipe unit cost accuracy within WAC precision limits.

---

## 3. Users

| Role | Access Level | Primary Actions |
|---|---|---|
| Owner | Full CRUD | Manage recipes and raw materials |
| Manager | Full CRUD | Manage recipes and raw materials |
| Production Staff | Read only | View recipes and material requirements |
| Sales Staff | No access | — |
| Store Staff | No access | — |

---

## 4. User Stories

### Raw Materials

- **US-RM-01:** As an owner, I want to add raw materials with name, unit, and reorder level so that purchases and recipes can reference them.
- **US-RM-02:** As a manager, I want to set a reorder level on a raw material so that I receive low stock alerts before running out.
- **US-RM-03:** As a manager, I want to deactivate a raw material that is no longer used so that it doesn't appear in new purchases or recipes.

### Recipes

- **US-RC-01:** As a manager, I want to create a recipe for a product listing all required raw materials and quantities so that production automatically deducts the right amounts.
- **US-RC-02:** As an owner, I want to see the live calculated cost of a recipe based on current material prices so that I can evaluate product profitability.
- **US-RC-03:** As a manager, I want to update a recipe (new version) when ingredients change so that future production uses the new formula without affecting past records.
- **US-RC-04:** As a manager, I want to define yield quantity (e.g., "this recipe makes 24 pieces") so that partial production scales correctly.
- **US-RC-05:** As production staff, I want to view a product's recipe and material requirements so that I know what to prepare before production.
- **US-RC-06:** As an owner, I want to see recipe version history so that I can audit formula changes over time.

---

## 5. Inputs

### 5.1 Raw Material — Create / Edit

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `code` | string | No | Auto-generated | Format: `RM-001` |
| `name` | string | Yes | — | Max 120 chars |
| `category` | string | Yes | — | Flour, Dairy, Packaging, etc. |
| `unit` | string | Yes | — | From org settings |
| `reorderLevel` | number | No | null | Alert threshold |
| `description` | string | No | null | Max 500 chars |
| `isActive` | boolean | Yes | true | — |

### 5.2 Recipe — Create / Edit (New Version)

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `productId` | reference | Yes | — | Must be active product |
| `yieldQuantity` | number | Yes | — | e.g., 24 |
| `yieldUnit` | string | Yes | — | Usually matches product unit |
| `ingredients[]` | array | Yes (≥1) | — | See below |
| `laborCost` | money | No | 0 | Per yield batch, minor units |
| `notes` | string | No | null | Max 1000 chars |

**Ingredient line:**

| Field | Type | Required |
|---|---|---|
| `rawMaterialId` | reference | Yes |
| `quantity` | number | Yes, > 0 |
| `unit` | string | Yes |

### 5.3 List Filters

**Raw Materials:** search, category, status (active/inactive), low stock only.

**Recipes:** search by product name, filter by has/doesn't have active recipe, category.

---

## 6. Outputs

### 6.1 Raw Material List

- Table: code, name, category, unit, current stock, avg cost, total value, reorder level, status.
- Low stock indicator badge.

### 6.2 Recipe List

- Table: product name, category, yield, ingredient count, unit cost, total material cost, version, status.
- Link to product detail.

### 6.3 Recipe Detail / Form

- Product info (read-only header).
- Ingredients table with live WAC and line cost.
- Computed fields (read-only):
  - `totalMaterialCost` = Σ (ingredient qty × raw material WAC)
  - `unitCost` = (totalMaterialCost + laborCost) / yieldQuantity
- Version number and history tab.

### 6.4 Side Effects

- Creating first active recipe for a product sets `products.activeRecipeId`.
- New recipe version deactivates previous active recipe for same product.
- No inventory changes from recipe CRUD alone.

---

## 7. Business Rules

### Raw Materials

| # | Rule |
|---|---|
| BR-RM-01 | Raw material must exist before appearing in purchases or recipe ingredients. |
| BR-RM-02 | Raw material `code` unique per org. |
| BR-RM-03 | Deactivating raw material hides from new purchases and recipe ingredients. |
| BR-RM-04 | Raw material with active recipe ingredients can be deactivated with warning. |
| BR-RM-05 | `reorderLevel` optional; when set and `currentStock ≤ reorderLevel`, item flagged low stock. |
| BR-RM-06 | `averageCost` and `currentStock` are denormalized from inventory — never edited here. |

### Recipes

| # | Rule |
|---|---|
| BR-RC-01 | One active recipe per product at any time. |
| BR-RC-02 | Updating a recipe creates a **new version**; previous version deactivated, not overwritten. |
| BR-RC-03 | Recipe version increments sequentially per product (1, 2, 3...). |
| BR-RC-04 | Ingredient scaling formula: `consumed = (productionQty / yieldQuantity) × ingredientQty`. |
| BR-RC-05 | Recipe cost uses current raw material WAC at time of recipe save (informational). |
| BR-RC-06 | Production uses recipe snapshot at production time — recipe changes don't affect past production. |
| BR-RC-07 | A product can have only one active recipe; creating new recipe for product with active recipe prompts version confirmation. |
| BR-RC-08 | Recipe requires at least one ingredient. |
| BR-RC-09 | Duplicate raw material in same recipe not allowed (combine quantities). |
| BR-RC-10 | Product must be active to create/update recipe. |

---

## 8. Validation Rules

### Raw Material

| Field | Validation | Error Message |
|---|---|---|
| `name` | Required; 1–120 chars; unique per org (case-insensitive) | "Raw material name is required" / "Name already exists" |
| `code` | Unique per org if provided | "Code already in use" |
| `category` | Valid org category | "Invalid category" |
| `unit` | Valid org unit | "Invalid unit" |
| `reorderLevel` | null or number ≥ 0 | "Reorder level cannot be negative" |

### Recipe

| Field | Validation | Error Message |
|---|---|---|
| `productId` | Required; active product; exists in org | "Product is required" / "Product not found" |
| `yieldQuantity` | Required; > 0 | "Yield quantity must be greater than zero" |
| `yieldUnit` | Required | "Yield unit is required" |
| `ingredients` | Min 1 item | "Add at least one ingredient" |
| `ingredients[].rawMaterialId` | Active raw material in org | "Invalid or inactive raw material" |
| `ingredients[].quantity` | > 0 | "Quantity must be greater than zero" |
| `ingredients[].rawMaterialId` | No duplicates in array | "Duplicate raw material — combine quantities" |
| `laborCost` | ≥ 0 | "Labor cost cannot be negative" |

---

## 9. Firestore Collections Used

| Collection | Operation | Purpose |
|---|---|---|
| `organizations/{orgId}/rawMaterials/{rawMaterialId}` | CRUD | Raw material records |
| `organizations/{orgId}/recipes/{recipeId}` | CRUD | Recipe records (versioned) |
| `organizations/{orgId}/products/{productId}` | Read/Update | Link activeRecipeId |
| `organizations/{orgId}/inventory/balances/raw_{rawMaterialId}` | Read | WAC and stock for cost display |
| `organizations/{orgId}/settings/config` | Read | Categories, units |

**Indexes required:**

- `(organizationId, isActive, name)` on rawMaterials and recipes
- `(organizationId, productId, isActive)` on recipes
- `(organizationId, isLowStock)` on inventory balances (for low stock filter)

---

## 10. UI Components

### Pages

| Route | Description |
|---|---|
| `/raw-materials` | Raw material list |
| `/raw-materials/new` | Create raw material |
| `/raw-materials/[id]` | Edit raw material |
| `/recipes` | Recipe list |
| `/recipes/new` | Create recipe (select product) |
| `/recipes/[id]` | View/edit recipe |
| `/products/[id]` | Tab: "Recipe" — shortcut from product detail |

### Shared Components

`PageHeader`, `DataTable`, `EmptyState`, `ConfirmDialog`, `MoneyDisplay`, `MoneyInput`, `QuantityInput`, `ItemCombobox`, `StatusBadge`, `LoadingSkeleton`

### Module-Specific Components

| Component | Description |
|---|---|
| `RawMaterialForm` | Create/edit raw material |
| `RawMaterialFilters` | Search, category, low stock filter |
| `RecipeForm` | Product selector, yield, ingredients, labor cost |
| `RecipeIngredientRow` | Material picker, qty, unit, live WAC, line cost |
| `RecipeCostSummary` | Total material cost, labor, unit cost display |
| `RecipeVersionHistory` | Read-only list of past versions |
| `MaterialCombobox` | Searchable raw material picker |
| `LowStockBadge` | Amber badge when stock ≤ reorder level |

### shadcn/ui Primitives

`Button`, `Input`, `Select`, `Form`, `Card`, `Badge`, `Dialog`, `Tabs`, `Table`, `Separator`, `Alert` (cost warnings), `Tooltip` (WAC explanation)

---

## 11. Edge Cases

| # | Scenario | Expected Behavior |
|---|---|---|
| EC-RC-01 | Create recipe for product that already has active recipe | Prompt: "Create new version?" — deactivates old, creates v+1 |
| EC-RC-02 | Raw material WAC is 0 (no purchases yet) | Show unit cost as ₹0.00 with warning "No purchase cost recorded" |
| EC-RC-03 | Deactivate raw material used in active recipe | Warn: "Used in active recipe for {product}" — allow with confirmation |
| EC-RC-04 | Delete raw material with purchase history | Soft delete only; block if movements exist |
| EC-RC-05 | Recipe with 10+ ingredients | Form scrolls; save handles batch writes |
| EC-RC-06 | Product deactivated while recipe active | Recipe remains but flagged; no new production allowed |
| EC-RC-07 | Change yield quantity on new version | Old production scaling unaffected (uses snapshot) |
| EC-RC-08 | Ingredient unit differs from raw material master unit | Block — ingredient unit must match raw material unit in v1 |
| EC-RC-09 | Two managers create recipe version simultaneously | Transaction ensures single active recipe per product |
| EC-RC-10 | Recipe cost display while WAC updating (mid-purchase) | Show WAC at page load; refresh on save |

---

## 12. Acceptance Criteria

### Raw Materials

- [ ] Owner/Manager can CRUD raw materials with all fields.
- [ ] List shows current stock, avg cost, and low stock badge.
- [ ] Reorder level triggers `isLowStock` on inventory balance when stock falls below.
- [ ] Deactivated materials hidden from purchase and recipe pickers.

### Recipes

- [ ] Owner/Manager can create recipe linked to active product.
- [ ] Recipe requires ≥ 1 ingredient with valid raw material.
- [ ] Live cost calculation displays total material cost and unit cost.
- [ ] Creating new recipe for product with existing active recipe creates new version.
- [ ] Previous recipe version deactivated; version history viewable.
- [ ] `products.activeRecipeId` updated on active recipe change.
- [ ] Production staff can view recipes read-only.

### Non-Functional

- [ ] Cost calculation uses integer math (minor units).
- [ ] Role permissions enforced in UI and security rules.
- [ ] All validations client + server side.

---

## 13. Future Enhancements

| Priority | Enhancement |
|---|---|
| P2 | Unit conversion (recipe in grams, purchase in kg) |
| P2 | Semi-finished goods as recipe ingredients (sub-recipes) |
| P2 | Recipe templates (copy recipe to new product) |
| P2 | Margin suggestion (target margin → suggested selling price) |
| P2 | Bulk raw material import from CSV |
| P3 | Nutritional calculation from ingredients |
| P3 | Recipe approval workflow (draft → approved) |
| P3 | Production loss/wastage factor per recipe (e.g., 5% shrinkage) |

---

*Raw Material Master and Recipe Master ship together as Module 02. Do not implement Production until this module is approved and complete.*
