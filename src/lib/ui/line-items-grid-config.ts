import type { LineItemsGridColumn } from '@/components/shared/line-items-grid/line-items-grid';

/** Shared grid column presets for data-entry forms. */

export const PURCHASE_LINE_COLUMNS: LineItemsGridColumn[] = [
  { id: 'material', label: 'Material', required: true },
  { id: 'quantity', label: 'Qty', required: true },
  { id: 'unit', label: 'Unit' },
  { id: 'cost', label: 'Cost', required: true },
  { id: 'total', label: 'Total' },
  { id: 'actions', label: 'Remove', srOnly: true },
];

export const RECIPE_LINE_COLUMNS: LineItemsGridColumn[] = [
  { id: 'material', label: 'Material', required: true },
  { id: 'quantity', label: 'Qty', required: true },
  { id: 'unit', label: 'Unit' },
  { id: 'actions', label: 'Actions', srOnly: true },
];

export const SALE_LINE_COLUMNS: LineItemsGridColumn[] = [
  { id: 'product', label: 'Product', required: true },
  { id: 'quantity', label: 'Qty', required: true },
  { id: 'unit', label: 'Unit' },
  { id: 'price', label: 'Price', required: true },
  { id: 'total', label: 'Total' },
  { id: 'actions', label: 'Remove', srOnly: true },
];

export const PRODUCTION_LINE_COLUMNS: LineItemsGridColumn[] = [
  { id: 'product', label: 'Product', required: true },
  { id: 'quantity', label: 'Qty', required: true },
  { id: 'unit', label: 'Unit' },
  { id: 'actions', label: 'Remove', srOnly: true },
];

/** Tailwind grid template classes — applied on lg+; mobile uses stacked cells. */
export const PURCHASE_GRID_ROW_CLASS =
  'lg:grid-cols-[minmax(0,2fr)_minmax(4.5rem,0.55fr)_minmax(3rem,0.35fr)_minmax(5.5rem,0.6fr)_minmax(5.5rem,0.6fr)_2.25rem]';

export const RECIPE_GRID_ROW_CLASS =
  'lg:grid-cols-[minmax(0,2fr)_minmax(4.5rem,0.55fr)_minmax(3rem,0.35fr)_5.5rem]';

export const SALE_GRID_ROW_CLASS =
  'lg:grid-cols-[minmax(0,2fr)_minmax(4.5rem,0.55fr)_minmax(3rem,0.35fr)_minmax(5.5rem,0.6fr)_minmax(5.5rem,0.6fr)_2.25rem]';

export const PRODUCTION_GRID_ROW_CLASS =
  'lg:grid-cols-[minmax(0,2fr)_minmax(4.5rem,0.55fr)_minmax(3rem,0.35fr)_2.25rem]';

export const PURCHASE_GRID_MIN_WIDTH = 'min-w-[42rem]';
export const RECIPE_GRID_MIN_WIDTH = 'min-w-[32rem]';
export const SALE_GRID_MIN_WIDTH = 'min-w-[42rem]';
export const PRODUCTION_GRID_MIN_WIDTH = 'min-w-[28rem]';
