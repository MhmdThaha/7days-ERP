# 7Days Bakery ERP — UI Guidelines

> **Document purpose:** Visual design system, component patterns, layout standards, and UX conventions for a consistent, professional, commercial-quality interface.

**Version:** 1.0  
**Last updated:** 2026-07-07

---

## 1. Design Philosophy

### 1.1 Core Principles

| Principle | Application |
|---|---|
| **Clarity over cleverness** | Bakery staff use this daily under time pressure. Labels must be plain language, not ERP jargon. |
| **Speed of entry** | Transaction screens (sales, production) optimize for fast repetitive data entry. |
| **Today-first** | Default every transactional view to today's date. Historical access is secondary. |
| **Progressive disclosure** | Show essentials first; advanced fields in expandable sections. |
| **Trust through feedback** | Every action confirms success/failure. Inventory changes show immediate feedback. |
| **Mobile-aware, desktop-primary** | Responsive layout, but optimized for desktop/tablet use in a bakery office. |

### 1.2 What We Are NOT Building

- A spreadsheet clone (no cell grids as primary UI)
- A consumer app with playful illustrations
- A dark-only developer tool aesthetic
- An over-animated dashboard

---

## 2. Visual Identity

### 2.1 Brand Direction

**Assumption:** Brand name is **7Days Bakery ERP**. Final logo and brand colors to be confirmed by owner.

**Recommended aesthetic:** Clean, warm, professional — appropriate for food business owners who need clarity, not flash.

### 2.2 Color Palette

Use CSS variables (shadcn theming). Recommended starting palette:

```css
/* Light mode — primary theme */
:root {
  /* Brand */
  --brand-primary: 24 85% 45%;        /* Warm amber/brown — bakery feel */
  --brand-primary-foreground: 0 0% 100%;

  /* Semantic */
  --success: 142 76% 36%;             /* Green — profit, stock OK */
  --warning: 38 92% 50%;              /* Amber — low stock, warnings */
  --destructive: 0 84% 60%;           /* Red — delete, negative stock, loss */

  /* Neutral — use shadcn defaults for background, card, muted, border */
}
```

| Semantic Use | Color Token |
|---|---|
| Profit, positive variance | `text-emerald-600` / success badge |
| Loss, negative stock, wastage | `text-red-600` / destructive badge |
| Low stock warning | `text-amber-600` / warning badge |
| Neutral metrics | `text-foreground` |
| Secondary labels | `text-muted-foreground` |

**Dark mode:** Support via shadcn theme toggle. Not required for v1 launch but structure CSS variables for future enablement.

### 2.3 Typography

| Element | Font | Size | Weight |
|---|---|---|---|
| Page title | Inter (shadcn default) | `text-2xl` (24px) | semibold |
| Section heading | Inter | `text-lg` (18px) | semibold |
| Body | Inter | `text-sm` (14px) | normal |
| Table data | Inter | `text-sm` (14px) | normal |
| Metric value (KPI) | Inter | `text-3xl` (30px) | bold |
| Metric label | Inter | `text-xs` (12px) | medium, muted |
| Form label | Inter | `text-sm` | medium |

**Numbers:** Use `font-variant-numeric: tabular-nums` for aligned financial figures in tables and dashboards.

### 2.4 Spacing & Layout

- Base spacing unit: Tailwind 4px scale
- Page padding: `p-6` (desktop), `p-4` (mobile)
- Card padding: `p-4` to `p-6`
- Form field gap: `space-y-4`
- Section gap: `space-y-6`
- Max content width for forms: `max-w-2xl`
- Max content width for lists/dashboard: full width within main area

### 2.5 Borders & Shadows

- Cards: shadcn `Card` with default border, subtle shadow
- Avoid heavy shadows — keep flat and clean
- Border radius: shadcn default (`rounded-lg` for cards, `rounded-md` for inputs)

---

## 3. Application Layout

### 3.1 Shell Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Top Bar: Org name · Date · User menu · (optional) Quick add │
├──────────┬──────────────────────────────────────────────────┤
│          │  Breadcrumb                                      │
│  Sidebar │  ──────────────────────────────────────────────── │
│  Nav     │  Page Header (title + primary action)            │
│          │  ──────────────────────────────────────────────── │
│          │  Page Content                                    │
│          │                                                  │
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

### 3.2 Sidebar Navigation

Use shadcn **Sidebar** component. Collapsible on tablet.

**Navigation order (matches business priority):**

```
📊 Dashboard
─────────────
📦 Products
📋 Recipes
─────────────
🛒 Purchases
🏭 Production
💰 Sales
💸 Expenses
🗑️ Wastage
─────────────
📦 Inventory
📅 Daily Summary
📆 Monthly Summary
─────────────
⚙️ Settings
```

**Icons:** Lucide React — consistent `size-4` in nav, `size-5` standalone.

**Active state:** Highlight current route. Show module name, not just icon, when sidebar expanded.

### 3.3 Top Bar

| Element | Position | Content |
|---|---|---|
| Sidebar trigger | Left | Collapse/expand |
| Business date indicator | Center-left | "Today: 7 Jul 2026" (org timezone) |
| Quick add button | Center-right | Dropdown: Sale, Production, Purchase, Expense |
| User menu | Right | Name, role, logout, settings |

### 3.4 Breadcrumbs

Every page below dashboard level shows breadcrumbs:

```
Dashboard / Products / Edit Product
```

Use shadcn Breadcrumb component.

---

## 4. Page Patterns

### 4.1 List Page

Used for: Products, Raw Materials, Purchases, Production, Sales, Expenses, Wastage, Inventory.

```
┌─────────────────────────────────────────────────┐
│ Page Title                    [+ Add New]      │
├─────────────────────────────────────────────────┤
│ [Date filter] [Category filter] [Search...]    │
├─────────────────────────────────────────────────┤
│ Data Table                                       │
│  - Sortable columns                              │
│  - Row actions (edit, delete)                    │
│  - Pagination                                    │
├─────────────────────────────────────────────────┤
│ Showing 1-25 of 142          [< 1 2 3 ... >]    │
└─────────────────────────────────────────────────┘
```

**Requirements:**

- Date filter defaults to **today** for transactional lists; **all time** for masters
- Search is debounced (300ms)
- Empty state with illustration/icon + CTA ("No products yet. Add your first product.")
- Loading: skeleton rows matching table structure
- Row click opens detail/edit (except action buttons)

### 4.2 Form Page (Create / Edit)

```
┌─────────────────────────────────────────────────┐
│ ← Back    Create Product                         │
├─────────────────────────────────────────────────┤
│ Card: Basic Information                          │
│   Field 1                                        │
│   Field 2                                        │
│   Field 3                                        │
├─────────────────────────────────────────────────┤
│ Card: Additional Details (optional, collapsed)   │
├─────────────────────────────────────────────────┤
│                    [Cancel]  [Save Product]      │
└─────────────────────────────────────────────────┘
```

**Requirements:**

- Single-column form layout on desktop (not multi-column — reduces errors)
- Required fields marked with asterisk
- Inline validation on blur and on submit
- Save button: primary, right-aligned
- Cancel: ghost/outline, confirms if dirty form
- Disable submit while saving; show spinner in button
- Success: toast + redirect to list (or stay on edit for "Save & Continue" pattern)

### 4.3 Line-Item Entry Form

Used for: Purchases, Production, Sales (multi-line transactions).

```
┌─────────────────────────────────────────────────┐
│ Header fields (date, supplier/channel, etc.)     │
├─────────────────────────────────────────────────┤
│ Line Items                                       │
│ ┌─────────────────────────────────────────────┐ │
│ │ Item ▼ │ Qty │ Unit │ Price │ Total │ ✕     │ │
│ │ Item ▼ │ Qty │ Unit │ Price │ Total │ ✕     │ │
│ │ [+ Add line]                                │ │
│ └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│ Running Total: ₹12,450.00                        │
├─────────────────────────────────────────────────┤
│ Notes (optional)                                 │
├─────────────────────────────────────────────────┤
│                    [Cancel]  [Save]              │
└─────────────────────────────────────────────────┘
```

**Requirements:**

- Product/material picker: searchable combobox (shadcn Command + Popover)
- Auto-fill unit price from product master on item select
- Tab key moves between fields logically
- Enter on last field adds new line
- Remove line with confirmation if line has data
- Show stock availability hint when selecting products (sales/production)
- Total recalculates in real-time

### 4.4 Detail / View Page

Read-only view with edit button. Used for reviewing a saved transaction.

### 4.5 Dashboard Page

Grid of KPI cards + charts. See Section 6.

### 4.6 Summary Page

Daily Summary and Monthly Summary — report-style layout, read-only, print-friendly (Phase 2).

---

## 5. Shared Components

Build these in `src/components/shared/` once and reuse across all modules.

### 5.1 Component Library

| Component | Purpose |
|---|---|
| `PageHeader` | Title + description + action button slot |
| `DataTable` | Generic sortable, paginated table (TanStack Table + shadcn) |
| `DatePicker` | Org-timezone-aware date selection |
| `MoneyInput` | Formatted currency input (display decimal, store integer) |
| `MoneyDisplay` | Formatted currency display with tabular nums |
| `QuantityInput` | Numeric input with unit suffix |
| `ItemCombobox` | Searchable product/material selector |
| `EmptyState` | Icon + message + optional CTA |
| `ConfirmDialog` | Destructive action confirmation |
| `LoadingSkeleton` | Per-page skeleton layouts |
| `StatusBadge` | Active/inactive, low stock, day closed |
| `MetricCard` | KPI card for dashboard |
| `DateRangeFilter` | Preset filters: Today, Yesterday, This Week, This Month, Custom |
| `StockIndicator` | Inline stock level with color coding |

### 5.2 DataTable Standards

| Feature | Implementation |
|---|---|
| Pagination | 25 rows default; options: 10, 25, 50 |
| Sorting | Client-side for small sets; server-side for transactions |
| Row actions | Dropdown menu (Edit, Delete) — not inline icon clutter |
| Selection | Not required in v1 |
| Responsive | Horizontal scroll on mobile; priority columns first |
| Numeric columns | Right-aligned |
| Date columns | Formatted `dd MMM yyyy` |
| Money columns | Right-aligned, `MoneyDisplay` |

### 5.3 Form Field Patterns

```tsx
// Standard field structure
<FormField
  control={form.control}
  name="name"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Product Name *</FormLabel>
      <FormControl>
        <Input placeholder="e.g., White Bread Loaf" {...field} />
      </FormControl>
      <FormDescription>Optional helper text</FormDescription>
      <FormMessage />
    </FormItem>
  )}
/>
```

- Labels above inputs (not inline/floating)
- Helper text for non-obvious fields
- Error messages below field in destructive color

---

## 6. Dashboard Design

### 6.1 Layout Grid

```
┌──────────┬──────────┬──────────┬──────────┐
│  Sales   │ Production│ Expenses │  Profit  │
│  Today   │  Today   │  Today   │  Today   │
├──────────┴──────────┴──────────┴──────────┤
│  Sales Trend (30 days)        │ Low Stock  │
│  [Line Chart]                 │ [List]     │
├───────────────────────────────┼────────────┤
│  Best Sellers Today           │ Wastage    │
│  [Bar Chart / Table]          │ Today      │
├───────────────────────────────┴────────────┤
│  Quick Actions: [+ Sale] [+ Production] [+ Purchase]  │
└────────────────────────────────────────────┘
```

### 6.2 KPI Cards

```tsx
<MetricCard
  title="Today's Sales"
  value="₹45,230"
  change="+12% vs yesterday"
  changeType="positive"
  icon={ShoppingCart}
  href="/sales?salesDate=today"
/>
```

| State | Visual |
|---|---|
| Positive change | Green text with ↑ arrow |
| Negative change | Red text with ↓ arrow |
| Neutral | Muted text, no arrow |
| Loading | Skeleton pulse |
| Zero/no data | Show "₹0" not blank |

**Cards are clickable** — navigate to filtered module view for that metric.

### 6.3 Charts (Recharts via shadcn Chart)

| Chart | Type | Module |
|---|---|---|
| Sales trend | Line / Area | Dashboard, Monthly Summary |
| Category mix | Pie / Donut | Dashboard, Monthly Summary |
| Production vs Sales | Grouped bar | Daily Summary |
| Top products | Horizontal bar | Dashboard, Daily Summary |
| Expense breakdown | Pie | Monthly Summary |
| Daily profit trend | Line | Monthly Summary |

**Chart rules:**

- Always include legend
- Tooltip on hover with formatted values
- Responsive container — never fixed pixel width
- Use brand primary color for primary data series
- Muted colors for secondary series
- Empty chart state: "No data for this period"

---

## 7. Module-Specific UX Notes

### 7.1 Product Master

- List view with thumbnail, name, category, price, stock, status badge
- Inline active/inactive toggle (with confirmation on deactivate)
- Recipe linked indicator (badge: "Has Recipe" / "No Recipe")

### 7.2 Recipe Master

- Create recipe from product detail page or recipe list
- Show live material cost calculation as ingredients are added
- Display current WAC for each ingredient next to quantity field
- Version history tab (read-only list of past recipes)

### 7.3 Purchases

- Supplier name: free text with autocomplete from previous entries (local cache)
- Invoice number optional
- Multi-line with material combobox
- Show running total prominently

### 7.4 Daily Production

- Date defaults to today
- After selecting product, show required materials and current stock
- Warning banner (not blocking by default) if insufficient materials
- Batch entry: add multiple products before saving

### 7.5 Daily Sales

- Optimized for speed: last-used channel/payment method remembered
- Product search by name or code
- Show product price auto-filled, editable
- Optional discount per line
- Large "Save Sale" button — primary action

### 7.6 Expenses

- Simple single-entry form (no line items)
- Category dropdown from org settings
- Receipt upload: drag-and-drop zone

### 7.7 Wastage

- Toggle: Raw Material / Finished Product (changes item picker)
- Reason dropdown
- Cost auto-calculated, read-only by default

### 7.8 Inventory

- Two tabs: Raw Materials | Finished Products
- Columns: Name, Qty, Unit, Avg Cost, Total Value, Status
- Status badges: OK (green), Low Stock (amber), Negative (red)
- Click row → movement ledger for that item
- Low stock tab/filter at top

### 7.9 Daily Summary

- Date picker at top (default today)
- Metric cards row
- Product performance table (produced vs sold gap)
- No edit actions — read-only
- "Close Day" button for manager (if day close enabled)

### 7.10 Monthly Summary

- Month/year selector
- KPI row
- Trend charts
- Best sellers and wastage tables
- Comparison to previous month (Phase 2)

---

## 8. Feedback & Notifications

### 8.1 Toast Notifications (sonner)

| Action | Toast |
|---|---|
| Create success | "Product created successfully" |
| Update success | "Production entry saved" |
| Delete success | "Expense deleted" |
| Error | "Failed to save sale. Please try again." |
| Warning | "Saved with insufficient stock warning" |

- Position: bottom-right
- Duration: 4 seconds (errors: 6 seconds, persist optional)
- Do not toast on page navigation or read operations

### 8.2 Confirmation Dialogs

Required before:

- Delete any record
- Deactivate product/material
- Close business day
- Any irreversible action

```tsx
<ConfirmDialog
  title="Delete this sale?"
  description="This will restore product inventory. This action cannot be undone."
  confirmLabel="Delete"
  variant="destructive"
/>
```

### 8.3 Inline Alerts

Use shadcn Alert for:

- Insufficient stock warnings on production/sales forms
- Negative inventory items
- Day closed — editing blocked message
- Setup incomplete (no products, no recipes)

---

## 9. Responsive Behavior

| Breakpoint | Tailwind | Behavior |
|---|---|---|
| Mobile | `< sm` (640px) | Sidebar hidden (sheet/drawer), single column, simplified tables |
| Tablet | `sm - lg` | Collapsible sidebar, usable but not primary target |
| Desktop | `≥ lg` (1024px) | Full layout — primary design target |
| Wide | `≥ xl` (1280px) | Dashboard 4-column KPI grid |

**Priority:** Desktop first. Mobile supports viewing dashboard and recording sales; complex forms (recipes, production) may show simplified mobile layout with note "For best experience, use a tablet or computer."

---

## 10. Accessibility

| Requirement | Standard |
|---|---|
| Color contrast | WCAG AA minimum (4.5:1 text) |
| Focus indicators | Visible focus ring on all interactive elements |
| Keyboard navigation | All forms and tables navigable by keyboard |
| Screen readers | Semantic HTML, aria labels on icon-only buttons |
| Form errors | Associated with fields via aria-describedby |
| Loading states | aria-busy on loading containers |

---

## 11. Localization & Formatting

**v1:** English (India) only. Structure for i18n in Phase 2.

| Type | Format | Example |
|---|---|---|
| Currency | INR symbol, 2 decimals | ₹1,234.50 |
| Date (display) | dd MMM yyyy | 07 Jul 2026 |
| Date (input) | Date picker, stored YYYY-MM-DD | |
| Number | Indian grouping (lakhs) optional; standard comma grouping v1 | 1,23,456 or 123,456 |
| Time | 12-hour with AM/PM | 2:30 PM |

Use `Intl.NumberFormat` and `date-fns` for formatting — centralized in utils.

---

## 12. Auth Pages

### 12.1 Login / Register

- Centered card layout, no sidebar
- Org logo / app name at top
- Clean, minimal — email + password
- Register: org name + owner details
- Link to login/register toggle

### 12.2 Onboarding (Post-Register)

Step wizard after first login:

```
Step 1: Organization settings (currency, timezone)
Step 2: Add raw materials (skip allowed)
Step 3: Add products (skip allowed)
Step 4: Done — go to dashboard
```

Use shadcn step indicator. Allow skip with reminder banner on dashboard.

---

## 13. Settings Pages

| Section | Fields |
|---|---|
| Organization | Name, logo, currency, timezone |
| Categories | Product categories, expense categories (editable lists) |
| Users & Roles | Member list, invite, role assignment (Owner only) |
| Preferences | Day close toggle, stock warning/block toggles |
| Danger Zone | Delete organization (Owner, double confirm) |

---

## 14. Loading & Empty States

### 14.1 Loading

- Page level: route `loading.tsx` with skeleton matching page layout
- Component level: `<Skeleton className="h-4 w-[200px]" />`
- Button loading: spinner icon + "Saving..." text, button disabled
- Never show blank white screen

### 14.2 Empty States

| Context | Message | CTA |
|---|---|---|
| No products | "No products yet" | "Add Product" |
| No sales today | "No sales recorded today" | "Record Sale" |
| No inventory movements | "No movements yet" | "Record a Purchase" |
| Search no results | "No results for '{query}'" | "Clear search" |

---

## 15. Print & Export (Phase 2)

Structure summary pages with print-friendly CSS:

```css
@media print {
  .sidebar, .topbar, .no-print { display: none; }
  .print-content { padding: 0; }
}
```

---

## 16. Do's and Don'ts

### Do

- Use shadcn components consistently
- Keep forms single-column
- Show monetary values right-aligned in tables
- Default dates to today
- Make destructive actions hard to trigger accidentally
- Provide keyboard shortcuts for power users (Phase 2)

### Don't

- Don't use modals for complex forms (use pages or sheets)
- Don't show raw Firestore IDs to users
- Don't use red/green without text labels (colorblind accessibility)
- Don't auto-save transactional forms (explicit save prevents errors)
- Don't hide errors — always show what went wrong
- Don't use placeholder images in production UI
- Don't animate excessively — subtle transitions only

---

## 17. Z-Index & Overlay Stack

| Layer | z-index | Component |
|---|---|---|
| Dropdown | 50 | DropdownMenu, Select |
| Sticky header | 40 | Top bar |
| Sidebar | 30 | Navigation |
| Modal/Dialog | 50 | Dialog, ConfirmDialog |
| Sheet (mobile nav) | 50 | Sheet |
| Toast | 100 | Sonner |

---

*All UI implementation must reference this document. Deviations require owner approval.*
