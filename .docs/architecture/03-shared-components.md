# 03 — Shared Components

> **Document purpose:** Catalog of reusable UI components, composition patterns, and module-specific vs shared boundaries. Prevents duplication across 11 business modules.

**Version:** 1.0  
**Last updated:** 2026-07-07  
**Status:** Draft — pending owner approval

**Related:** [UI_GUIDELINES.md](../UI_GUIDELINES.md) · [01-project-structure.md](./01-project-structure.md)

---

## 1. Component Hierarchy

```
shadcn/ui (primitives)
    └── shared/ (app-wide reusable)
            └── layout/ (shell)
                    └── {module}/ (feature-specific)
```

**Rule:** If a pattern appears in **2+ modules**, promote to `shared/`. If module-specific business UI, keep in `{module}/`.

---

## 2. shadcn/ui Primitives (Install Incrementally)

Install via CLI when first needed — do not bulk-install all upfront.

### Phase 0 (Foundation)

| Component | Usage |
|---|---|
| `button` | Everywhere |
| `input` | Forms |
| `label` | Forms |
| `form` | React Hook Form integration |
| `card` | Page sections, KPI cards |
| `skeleton` | Loading states |
| `sonner` (toast) | Mutation feedback |
| `separator` | Layout |
| `sidebar` | App navigation |
| `dropdown-menu` | User menu, row actions |
| `avatar` | User photo, product thumbnail fallback |
| `breadcrumb` | Page navigation |
| `tooltip` | Icon buttons, truncated text |

### Phase 1 (Masters)

| Component | Usage |
|---|---|
| `select` | Category, unit dropdowns |
| `table` | Data tables |
| `dialog` | Confirm dialogs |
| `badge` | Status indicators |
| `switch` | Active/inactive toggle |
| `textarea` | Descriptions |
| `tabs` | Inventory raw/finished; recipe history |

### Phase 2 (Transactions)

| Component | Usage |
|---|---|
| `calendar` + `popover` | Date picker |
| `command` | Searchable comboboxes |
| `alert` | Stock warnings, closed day |
| `sheet` | Mobile sidebar (optional) |
| `scroll-area` | Long line-item forms |

### Phase 3 (Reports / Dashboard)

| Component | Usage |
|---|---|
| `chart` | Recharts wrapper for trends |

---

## 3. Layout Components (`components/layout/`)

Built in **Phase 0** — required by every module.

| Component | Props / Behavior | Used By |
|---|---|---|
| `AppSidebar` | Collapsible; filters nav items by role | All dashboard routes |
| `TopBar` | Org name, today date, quick add, user menu | All dashboard routes |
| `NavItems` | Config array: `{ href, label, icon, roles, module }` | AppSidebar |
| `UserMenu` | Display name, role, settings link, logout | TopBar |
| `QuickAddMenu` | Dropdown: Sale, Production, Purchase, Expense, Wastage | TopBar |
| `Breadcrumbs` | Auto from pathname or manual override | All sub-pages |
| `DashboardLayout` | Composes sidebar + top bar + content area | `(dashboard)/layout.tsx` |

### 3.1 Navigation Config (Single Source)

`components/layout/nav-items.ts` exports typed navigation array consumed by sidebar and permission checks. **Never duplicate route lists** in multiple files.

---

## 4. Shared Components (`components/shared/`)

### 4.1 Page Structure

| Component | Description | Built In | Used By |
|---|---|---|---|
| `PageHeader` | Title, description, optional action slot (button) | Phase 0 | All list/create pages |
| `EmptyState` | Icon, title, description, optional CTA button | Phase 0 | All list pages |
| `LoadingSkeleton` | Generic; module-specific variants in subfolder | Phase 0 | All pages |
| `TableSkeleton` | Rows + columns skeleton | Phase 0 | All list pages |
| `FormSkeleton` | Form field placeholders | Phase 0 | Edit pages |

### 4.2 Data Table Subsystem

Built in **Phase 0–1**; used by all list views.

| Component | Description |
|---|---|
| `DataTable` | TanStack Table + shadcn Table wrapper; generic row type |
| `DataTablePagination` | Page size selector, prev/next, count |
| `DataTableColumnHeader` | Sortable column header |
| `DataTableRowActions` | Dropdown: Edit, Delete |
| `DataTableToolbar` | Search input + filter slot |

**Pattern:**

```tsx
// Module provides column definitions; shared DataTable handles rendering
const columns: ColumnDef<Product>[] = [...];
<DataTable columns={columns} data={products} pagination={...} />
```

### 4.3 Form Inputs

| Component | Description | Built In | Used By |
|---|---|---|---|
| `MoneyInput` | Display decimal; emit/store integer minor units | Phase 0 | Products, Purchases, Sales, Expenses, Recipes |
| `MoneyDisplay` | Format integer minor units as currency string | Phase 0 | All tables, KPIs |
| `QuantityInput` | Numeric input with optional unit suffix | Phase 0 | Production, Sales, Wastage, Purchases |
| `DatePicker` | Org-timezone-aware single date | Phase 0 | All transactional modules |
| `DateRangeFilter` | Presets: Today, Yesterday, This Week, This Month, Custom | Phase 1 | All list pages |
| `FormSection` | Card wrapper with section title for grouped fields | Phase 0 | All forms |
| `FormFooter` | Cancel + Submit button row | Phase 0 | All forms |

### 4.4 Entity Pickers

| Component | Description | Built In | Used By |
|---|---|---|---|
| `ProductCombobox` | Search active products; shows code, name, stock, price | Module 01 | Production, Sales |
| `MaterialCombobox` | Search active raw materials; shows stock, unit | Module 02 | Recipes, Purchases, Wastage |
| `CategorySelect` | Org settings categories dropdown | Phase 0 | Products, Expenses |
| `UnitSelect` | Org settings units dropdown | Phase 0 | Products, Raw Materials |
| `ReasonSelect` | Wastage reasons from settings | Module 07 | Wastage |

### 4.5 Display & Status

| Component | Description | Used By |
|---|---|---|
| `StatusBadge` | Active/Inactive, Open/Closed day | Products, Raw Materials, Daily Summary |
| `StockIndicator` | Qty with color: OK (green), Low (amber), Negative (red) | Products, Inventory, Sales form |
| `MovementTypeBadge` | Color-coded PURCHASE_IN, SALE_OUT, etc. | Inventory ledger |
| `PaymentStatusBadge` | paid / credit | Purchases |
| `RoleBadge` | User role display | Settings members |

### 4.6 Feedback & Dialogs

| Component | Description | Used By |
|---|---|---|
| `ConfirmDialog` | Title, description, confirm/cancel; destructive variant | All delete/deactivate actions |
| `AlertBanner` | Inline page-level warning (insufficient stock, closed day) | Production, Sales, transactional edits |
| `SetupIncompleteBanner` | Onboarding reminder on dashboard | Dashboard |

### 4.7 Line-Item Pattern (Transactional Forms)

Shared pattern built with **Module 03**; reused in Production and Sales.

| Component | Description | Used By |
|---|---|---|
| `LineItemsContainer` | Card with header, rows, add button, total bar | Purchases, Production, Sales |
| `LineItemRow` | Generic row wrapper (slot-based) | Module-specific row components |
| `RunningTotalBar` | Sticky footer showing computed total | Purchases, Sales |
| `AddLineButton` | "+ Add line" consistent styling | Purchases, Production, Sales |

**Module-specific rows** (not shared — different fields):

- `PurchaseLineItemRow`
- `ProductionLineRow`
- `SalesLineRow`

### 4.8 Charts & Metrics

| Component | Description | Built In | Used By |
|---|---|---|---|
| `MetricCard` | Label, value, optional change %, icon, href link | Phase 0 | Dashboard, Daily Summary, Monthly Summary |
| `ChartLoader` | Dynamic import wrapper with skeleton fallback | Module 11 | Dashboard, Monthly Summary |
| `TrendLineChart` | Recharts line chart with shadcn ChartContainer | Module 11 | Dashboard, Monthly Summary |
| `CategoryPieChart` | Pie/donut for expense/sales category mix | Module 09/10 | Daily Summary, Monthly Summary, Dashboard |
| `ComparisonBadge` | "+12% vs yesterday" with color | Module 11 | Dashboard KPIs |

### 4.9 File Upload

| Component | Description | Used By |
|---|---|---|
| `FileUploadZone` | Drag-and-drop; type/size validation | Product images, Expense receipts |
| `ImagePreview` | Thumbnail with remove button | Product form |
| `ReceiptPreview` | Image/PDF preview on detail | Expense detail |

---

## 5. Auth Components (`components/auth/`)

| Component | Phase | Description |
|---|---|---|
| `LoginForm` | 0 | Email/password; calls login action |
| `RegisterForm` | 0 | Org name + owner details; calls register action |
| `ForgotPasswordForm` | 0 | Firebase password reset email |
| `AuthCard` | 0 | Centered card wrapper for auth pages |

---

## 6. Module-Specific Components (Not Shared)

These stay in `components/{module}/` — do not promote unless second module needs identical UI.

| Module | Components |
|---|---|
| **Products** | `ProductForm`, `ProductFilters`, `ProductImageUpload`, `ProductStockBadge` |
| **Recipes** | `RecipeForm`, `RecipeIngredientRow`, `RecipeCostSummary`, `RecipeVersionHistory`, `RawMaterialForm` |
| **Purchases** | `PurchaseForm`, `PurchaseLineItemRow`, `SupplierAutocomplete` |
| **Production** | `ProductionForm`, `ProductionLineRow`, `ProductionMaterialPreview`, `MaterialRequirementTable` |
| **Sales** | `SalesForm`, `SalesLineRow`, `SalesTotalBar`, `SalesProfitSummary` |
| **Expenses** | `ExpenseForm`, `ExpenseCategorySummary`, `ReceiptUpload` |
| **Wastage** | `WastageForm`, `WastageItemTypeToggle`, `WastageCostDisplay` |
| **Inventory** | `InventoryBalanceTabs`, `InventoryBalanceTable`, `MovementLedgerTable`, `StockAdjustmentForm`, `LowStockList` |
| **Daily Summary** | `DailySummaryKPIGrid`, `ProductPerformanceTable`, `DayCloseButton`, `SummaryDateNavigator` |
| **Monthly Summary** | `MonthYearPicker`, `DailyTrendChart`, `BestSellersTable`, `WastageRankingTable` |
| **Dashboard** | `DashboardKPIGrid`, `LowStockWidget`, `BestSellersWidget`, `QuickActionsBar`, `RoleFilteredDashboard` |

---

## 7. Composition Patterns

### 7.1 List Page Template

```
<PageHeader title="Products" action={<Button>Add Product</Button>} />
<Filters />                          // module-specific or DateRangeFilter
<DataTable ... />                    // shared
// OR
<EmptyState ... />                   // when no data
```

### 7.2 Create/Edit Page Template

```
<PageHeader title="Create Product" />
<FormSection title="Basic Information">
  <EntityForm />
</FormSection>
<FormFooter onCancel={...} onSubmit={...} isLoading={...} />
```

### 7.3 Transactional Form Template

```
<PageHeader title="Record Sale" />
<Card>Header fields (date, channel, payment)</Card>
<LineItemsContainer>
  {lines.map(... => <SalesLineRow />)}
  <AddLineButton />
  <RunningTotalBar total={netTotal} />
</LineItemsContainer>
<FormFooter />
```

### 7.4 Read-Only Summary Template

```
<SummaryDateNavigator date={date} onChange={setDate} />
<DailySummaryKPIGrid metrics={summary} />
<ProductPerformanceTable products={summary.topProducts} />
// No FormFooter — read only
```

---

## 8. Client vs Server Component Assignment

| Component | RSC or Client | Reason |
|---|---|---|
| `PageHeader` | Server or Client | No interactivity — either works |
| `DataTable` | **Client** | Sorting, pagination state |
| `ProductCombobox` | **Client** | Search, keyboard nav |
| `MoneyInput` | **Client** | Controlled input |
| `DatePicker` | **Client** | Popover interaction |
| `MetricCard` | Server | Static display with link |
| `MoneyDisplay` | Server | Pure formatting |
| `EmptyState` | Server | Static |
| `ConfirmDialog` | **Client** | Dialog state |
| `ChartLoader` | **Client** | Dynamic import, Recharts |
| `ProductForm` | **Client** | React Hook Form |
| `DashboardLayout` | Mixed | Shell server; sidebar client for collapse |

---

## 9. Styling Conventions

| Concern | Standard |
|---|---|
| Money in tables | Right-aligned; `MoneyDisplay`; `tabular-nums` |
| Numeric qty | Right-aligned |
| Status colors | green=OK, amber=warning, red=destructive (always with text label) |
| Form layout | Single column; `max-w-2xl` for master forms; full width for line-item tables |
| Page padding | `p-6` desktop, `p-4` mobile |
| Destructive actions | `ConfirmDialog` with variant destructive — never silent delete |

---

## 10. Accessibility Requirements (All Shared Components)

- All icon-only buttons have `aria-label`
- Form fields linked to labels and error messages via `aria-describedby`
- Focus visible on all interactive elements
- Color not sole indicator of status (include text/badge label)
- Keyboard navigable comboboxes (Command component)

---

## 11. Component Build Schedule

| Phase | Shared Components to Build |
|---|---|
| **0** | PageHeader, EmptyState, Skeletons, MoneyInput, MoneyDisplay, DatePicker, ConfirmDialog, FormSection, FormFooter, MetricCard, layout shell |
| **1** | DataTable subsystem, DateRangeFilter, CategorySelect, UnitSelect, ProductCombobox, FileUploadZone |
| **2** | LineItemsContainer, RunningTotalBar, MaterialCombobox, AlertBanner, StockIndicator |
| **3** | ChartLoader, TrendLineChart, CategoryPieChart, ComparisonBadge |

---

## 12. Anti-Patterns (Do Not Do)

| Anti-Pattern | Correct Approach |
|---|---|
| Copy-paste table pagination into each module | Use shared `DataTable` |
| Format money inline with `toFixed(2)` | Use `MoneyDisplay` / `formatMoney()` |
| Build product picker 3 times | One `ProductCombobox` with props for filtering |
| Put Firestore fetch in combobox | Combobox receives data from parent hook |
| Module-specific confirm dialog | Shared `ConfirmDialog` with props |
| 500-line form component | Split into section components |

---

*When implementing a module, check this catalog first. Propose new shared components when the same UI pattern appears twice.*
