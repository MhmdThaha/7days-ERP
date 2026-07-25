/**
 * Product Import Definition.
 *
 * Teaches the generic import engine WHAT a Product looks like, purely as
 * data: target columns (with vendor-column synonyms for auto-mapping) and
 * custom validators that encode BakeryOS business rules.
 *
 * The engine files never import from here — this module is consumed by
 * the orchestration/commit layer in later phases and passed INTO the
 * engine as ColumnDefinition[] / ValidationOptions.
 *
 * Field keys deliberately match the Product domain model
 * (src/types/product.ts, product.schema.ts) so commit logic can map
 * validated rows onto CreateProductInput without renaming.
 *
 * Units note: normalized money values are plain numbers in MAJOR units
 * (rupees), per the engine contract. Converting sellingPrice/costPrice to
 * the integer minor units stored in Firestore is the commit layer's job.
 */

import type {
  ColumnDefinition,
  NormalizedValue,
  ValidationIssue,
  ValidationOptions,
} from '@/lib/import/engine/types';

export const PRODUCT_ENTITY_TYPE = 'product' as const;

// ---------------------------------------------------------------------------
// Issue codes specific to product imports
// ---------------------------------------------------------------------------

export const PRODUCT_ISSUE_CODES = {
  INVALID_PRODUCT_CODE: 'INVALID_PRODUCT_CODE',
  NON_POSITIVE_SELLING_PRICE: 'NON_POSITIVE_SELLING_PRICE',
  NEGATIVE_AMOUNT: 'NEGATIVE_AMOUNT',
  NAME_TOO_LONG: 'NAME_TOO_LONG',
} as const;

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

/** Matches productFormSchema: letters, numbers, and hyphens only. */
const PRODUCT_CODE_PATTERN = /^[A-Za-z0-9-]+$/;
const PRODUCT_CODE_MAX_LENGTH = 20;
const PRODUCT_NAME_MAX_LENGTH = 120;

/** Indian GST slabs applicable to bakery/retail goods. */
const GST_SLABS = ['0', '5', '12', '18', '28'] as const;

export const PRODUCT_IMPORT_COLUMNS: readonly ColumnDefinition[] = [
  {
    field: 'name',
    label: 'Product Name',
    dataType: 'string',
    required: true,
    synonyms: ['Item Name', 'Name', 'Product', 'Item', 'Item Title'],
  },
  {
    field: 'code',
    label: 'Product Code',
    dataType: 'string',
    required: false,
    synonyms: ['Item Code', 'Code', 'SKU', 'Barcode', 'Product ID'],
  },
  {
    field: 'category',
    label: 'Category',
    dataType: 'string',
    required: false,
    // Free-form on purpose: BakeryOS suggests categories but accepts any
    // non-empty string, so imported categories must not be rejected.
    synonyms: ['Item Category', 'Product Category', 'Group', 'Item Group'],
  },
  {
    field: 'unit',
    label: 'Unit',
    dataType: 'string',
    required: false,
    synonyms: ['UOM', 'Base Unit', 'Primary Unit', 'Units', 'Measuring Unit'],
  },
  {
    field: 'sellingPrice',
    label: 'Selling Price',
    dataType: 'money',
    required: false,
    synonyms: ['Sale Price', 'Rate', 'MRP', 'Price', 'Sales Price', 'Sale Rate', 'Retail Price'],
  },
  {
    field: 'costPrice',
    label: 'Cost Price',
    dataType: 'money',
    required: false,
    synonyms: ['Purchase Price', 'Cost', 'Buy Price', 'Purchase Rate', 'Avg Cost', 'Average Cost'],
  },
  {
    field: 'gstRate',
    label: 'GST',
    dataType: 'percent',
    required: false,
    // isAllowedValue compares String(value) against these, so normalized
    // numbers (5, "5%" → 5) match the slab list.
    allowedValues: GST_SLABS,
    synonyms: ['GST %', 'GST Rate', 'Tax', 'Tax Rate', 'Tax %', 'GST Percentage'],
  },
  {
    field: 'openingStock',
    label: 'Opening Stock',
    dataType: 'number',
    required: false,
    synonyms: ['Qty', 'Quantity', 'Stock', 'Current Stock', 'Stock Qty', 'Opening Qty'],
  },
  {
    field: 'minimumStock',
    label: 'Minimum Stock',
    dataType: 'number',
    required: false,
    synonyms: ['Min Stock', 'Reorder Level', 'Min Qty', 'Low Stock Alert', 'Reorder Point'],
  },
];

// ---------------------------------------------------------------------------
// Business-rule validators (run by the engine's validator stage)
// ---------------------------------------------------------------------------

function issue(
  severity: ValidationIssue['severity'],
  code: string,
  message: string,
  field: string,
): ValidationIssue {
  return { severity, code, message, field };
}

/** Name length cap, matching productFormSchema. */
function validateName(value: NormalizedValue): readonly ValidationIssue[] {
  if (typeof value === 'string' && value.length > PRODUCT_NAME_MAX_LENGTH) {
    return [
      issue(
        'error',
        PRODUCT_ISSUE_CODES.NAME_TOO_LONG,
        `Product Name must be ${PRODUCT_NAME_MAX_LENGTH} characters or less.`,
        'name',
      ),
    ];
  }

  return [];
}

/** Code format + length, matching productFormSchema. */
function validateCode(value: NormalizedValue): readonly ValidationIssue[] {
  if (typeof value !== 'string' || value === '') {
    return [];
  }

  if (value.length > PRODUCT_CODE_MAX_LENGTH || !PRODUCT_CODE_PATTERN.test(value)) {
    return [
      issue(
        'error',
        PRODUCT_ISSUE_CODES.INVALID_PRODUCT_CODE,
        `Product Code must be ${PRODUCT_CODE_MAX_LENGTH} characters or less and use only letters, numbers, and hyphens.`,
        'code',
      ),
    ];
  }

  return [];
}

/** Selling price must be > 0 when provided (schema: positive amount). */
function validateSellingPrice(value: NormalizedValue): readonly ValidationIssue[] {
  if (typeof value === 'number' && value <= 0) {
    return [
      issue(
        'error',
        PRODUCT_ISSUE_CODES.NON_POSITIVE_SELLING_PRICE,
        'Selling Price must be greater than zero.',
        'sellingPrice',
      ),
    ];
  }

  return [];
}

/** Cost, opening stock, and minimum stock must not be negative. */
function nonNegative(field: string, label: string) {
  return (value: NormalizedValue): readonly ValidationIssue[] => {
    if (typeof value === 'number' && value < 0) {
      return [
        issue(
          'error',
          PRODUCT_ISSUE_CODES.NEGATIVE_AMOUNT,
          `${label} cannot be negative.`,
          field,
        ),
      ];
    }

    return [];
  };
}

export const PRODUCT_VALIDATION_OPTIONS: ValidationOptions = {
  fieldValidators: {
    name: validateName,
    code: validateCode,
    sellingPrice: validateSellingPrice,
    costPrice: nonNegative('costPrice', 'Cost Price'),
    openingStock: nonNegative('openingStock', 'Opening Stock'),
    minimumStock: nonNegative('minimumStock', 'Minimum Stock'),
  },
};

// ---------------------------------------------------------------------------
// Bundled definition (consumed via the registry in definitions/index.ts)
// ---------------------------------------------------------------------------

export const productImportDefinition = {
  entityType: PRODUCT_ENTITY_TYPE,
  label: 'Products',
  columns: PRODUCT_IMPORT_COLUMNS,
  validation: PRODUCT_VALIDATION_OPTIONS,
} as const;
