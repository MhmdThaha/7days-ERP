/**
 * Sale Import Definition.
 *
 * Teaches the generic import engine what one flat spreadsheet row of a
 * sales export looks like (line-per-row format). Field keys align with
 * future grouping/commit layers; this module is data-only and consumed
 * via the definitions registry.
 *
 * One import row = one sale line item. Grouping rows into Sale documents
 * is handled in a later phase — not here.
 */

import type {
  ColumnDefinition,
  NormalizedRow,
  NormalizedValue,
  ValidationIssue,
  ValidationOptions,
} from '@/lib/import/engine/types';

export const SALE_ENTITY_TYPE = 'sale' as const;

// ---------------------------------------------------------------------------
// Issue codes specific to sale imports
// ---------------------------------------------------------------------------

export const SALE_ISSUE_CODES = {
  CUSTOMER_NAME_TOO_LONG: 'CUSTOMER_NAME_TOO_LONG',
  NOTES_TOO_LONG: 'NOTES_TOO_LONG',
  NON_POSITIVE_QUANTITY: 'NON_POSITIVE_QUANTITY',
  NEGATIVE_SELLING_PRICE: 'NEGATIVE_SELLING_PRICE',
  PRODUCT_REFERENCE_REQUIRED: 'PRODUCT_REFERENCE_REQUIRED',
} as const;

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

const CUSTOMER_NAME_MAX_LENGTH = 120;
const NOTES_MAX_LENGTH = 1000;

/** Flat row columns for line-per-row sales spreadsheets (Vyapar/Tally-style). */
export const SALE_IMPORT_COLUMNS: readonly ColumnDefinition[] = [
  {
    field: 'saleNumber',
    label: 'Sale Number',
    dataType: 'string',
    required: false,
    synonyms: [
      'Invoice No',
      'Invoice Number',
      'Bill No',
      'Bill Number',
      'Sale No',
      'Sale #',
      'Voucher No',
    ],
  },
  {
    field: 'saleDate',
    label: 'Sale Date',
    dataType: 'date',
    required: true,
    synonyms: ['Date', 'Invoice Date', 'Bill Date', 'Sales Date', 'Transaction Date'],
  },
  {
    field: 'customerName',
    label: 'Customer Name',
    dataType: 'string',
    required: false,
    synonyms: ['Customer', 'Party Name', 'Party', 'Buyer', 'Client Name', 'Client'],
  },
  {
    field: 'productCode',
    label: 'Product Code',
    dataType: 'string',
    required: false,
    synonyms: ['Item Code', 'Code', 'SKU', 'Barcode', 'Product ID'],
  },
  {
    field: 'productName',
    label: 'Product Name',
    dataType: 'string',
    required: false,
    synonyms: ['Item Name', 'Name', 'Product', 'Item', 'Item Title', 'Description'],
  },
  {
    field: 'quantity',
    label: 'Quantity',
    dataType: 'number',
    required: true,
    synonyms: ['Qty', 'QTY', 'Units', 'Unit Qty', 'Sale Qty'],
  },
  {
    field: 'sellingPrice',
    label: 'Selling Price',
    dataType: 'money',
    required: false,
    synonyms: ['Rate', 'Price', 'Sale Price', 'Unit Price', 'MRP', 'Amount', 'Sales Price'],
  },
  {
    field: 'notes',
    label: 'Notes',
    dataType: 'string',
    required: false,
    synonyms: ['Remarks', 'Note', 'Comment', 'Comments', 'Narration'],
  },
];

// ---------------------------------------------------------------------------
// Business-rule validators (run by the engine's validator stage)
// ---------------------------------------------------------------------------

function issue(
  severity: ValidationIssue['severity'],
  code: string,
  message: string,
  field?: string,
): ValidationIssue {
  return { severity, code, message, field };
}

function hasNonEmptyString(value: NormalizedValue | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

/** Each row must identify a product by name or code (matches sale line resolution rules). */
function validateProductReference(row: NormalizedRow): readonly ValidationIssue[] {
  if (hasNonEmptyString(row.values['productName']) || hasNonEmptyString(row.values['productCode'])) {
    return [];
  }

  return [
    issue(
      'error',
      SALE_ISSUE_CODES.PRODUCT_REFERENCE_REQUIRED,
      'Product Name or Product Code is required on every row.',
      'productName',
    ),
  ];
}

function validateCustomerName(value: NormalizedValue): readonly ValidationIssue[] {
  if (typeof value === 'string' && value.length > CUSTOMER_NAME_MAX_LENGTH) {
    return [
      issue(
        'error',
        SALE_ISSUE_CODES.CUSTOMER_NAME_TOO_LONG,
        `Customer Name must be ${CUSTOMER_NAME_MAX_LENGTH} characters or less.`,
        'customerName',
      ),
    ];
  }

  return [];
}

function validateNotes(value: NormalizedValue): readonly ValidationIssue[] {
  if (typeof value === 'string' && value.length > NOTES_MAX_LENGTH) {
    return [
      issue(
        'error',
        SALE_ISSUE_CODES.NOTES_TOO_LONG,
        `Notes must be ${NOTES_MAX_LENGTH} characters or less.`,
        'notes',
      ),
    ];
  }

  return [];
}

function validateQuantity(value: NormalizedValue): readonly ValidationIssue[] {
  if (typeof value === 'number' && value <= 0) {
    return [
      issue(
        'error',
        SALE_ISSUE_CODES.NON_POSITIVE_QUANTITY,
        'Quantity must be greater than zero.',
        'quantity',
      ),
    ];
  }

  return [];
}

function validateSellingPrice(value: NormalizedValue): readonly ValidationIssue[] {
  if (typeof value === 'number' && value < 0) {
    return [
      issue(
        'error',
        SALE_ISSUE_CODES.NEGATIVE_SELLING_PRICE,
        'Selling Price cannot be negative.',
        'sellingPrice',
      ),
    ];
  }

  return [];
}

export const SALE_VALIDATION_OPTIONS: ValidationOptions = {
  fieldValidators: {
    customerName: validateCustomerName,
    notes: validateNotes,
    quantity: validateQuantity,
    sellingPrice: validateSellingPrice,
  },
  rowValidators: [validateProductReference],
};

// ---------------------------------------------------------------------------
// Bundled definition (consumed via the registry in definitions/index.ts)
// ---------------------------------------------------------------------------

export const saleImportDefinition = {
  entityType: SALE_ENTITY_TYPE,
  label: 'Sales',
  columns: SALE_IMPORT_COLUMNS,
  validation: SALE_VALIDATION_OPTIONS,
} as const;
