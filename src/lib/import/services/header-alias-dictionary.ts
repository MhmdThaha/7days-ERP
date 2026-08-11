/**
 * Universal sales-import header alias dictionary.
 *
 * Maps vendor export labels (after normalization) onto canonical import
 * field keys. Consumed by header detection only — no execution logic.
 */

export type SalesHeaderCanonicalField =
  | 'saleDate'
  | 'customerName'
  | 'productName'
  | 'productCode'
  | 'quantity'
  | 'amount'
  | 'invoiceNumber'
  | 'unit';

/**
 * Raw alias labels grouped by canonical field.
 * Each entry is normalized at lookup time — do not pre-normalize here.
 */
export const SALES_HEADER_ALIASES: Record<SalesHeaderCanonicalField, readonly string[]> = {
  saleDate: [
    'Sale Date',
    'Sales Date',
    'Date',
    'Invoice Date',
    'Bill Date',
    'Transaction Date',
    'Txn Date',
    'Voucher Date',
  ],
  customerName: [
    'Customer Name',
    'Customer',
    'Party Name',
    'Party',
    'Buyer',
    'Client Name',
    'Client',
    'Contact Name',
    'Contact',
  ],
  productName: [
    'Product Name',
    'Item Name',
    'Name',
    'Product',
    'Item',
    'Item Title',
    'Description',
  ],
  productCode: [
    'Product Code',
    'Item Code',
    'Code',
    'SKU',
    'Barcode',
    'Product ID',
    'Item ID',
  ],
  quantity: [
    'Qty',
    'QTY',
    'Quantity',
    'Sales Qty.',
    'Sales Qty',
    'Sales Qty :',
    'Qty Sold',
    'Quantity Sold',
    'Sales Quantity',
    'SALES_QTY',
    'sales qty',
    'Quantity (PCS)',
    'Units',
    'Unit Qty',
    'Sale Qty',
    'Sold Qty',
  ],
  amount: [
    'Amount',
    'Sales Amt.',
    'Sales Amt',
    'Net Amount',
    'Sale Value',
    'Total',
    'Total Amount',
    'Sales Amount',
    'Line Total',
    'Value',
    'Gross Amount',
  ],
  invoiceNumber: [
    'Invoice No',
    'Invoice No.',
    'Invoice Number',
    'Invoice #',
    'Bill No',
    'Bill No.',
    'Bill Number',
    'Sale No',
    'Sale Number',
    'Sale #',
    'Voucher No',
    'Voucher Number',
    'Ref No',
    'Reference Number',
  ],
  unit: ['Unit', 'UOM', 'Units', 'Measuring Unit', 'Base Unit', 'Primary Unit'],
};

/**
 * Entity column fields that satisfy each canonical key (first existing column wins).
 */
export const CANONICAL_FIELD_TARGETS: Record<SalesHeaderCanonicalField, readonly string[]> = {
  saleDate: ['saleDate'],
  customerName: ['customerName'],
  productName: ['productName', 'name'],
  productCode: ['productCode', 'code'],
  quantity: ['quantity'],
  amount: ['amount', 'sellingPrice'],
  invoiceNumber: ['saleNumber'],
  unit: ['unit'],
};

export function buildNormalizedUniversalAliasLookup(
  normalizeLabel: (value: string) => string,
): ReadonlyMap<string, SalesHeaderCanonicalField> {
  const lookup = new Map<string, SalesHeaderCanonicalField>();

  for (const [canonical, aliases] of Object.entries(SALES_HEADER_ALIASES) as Array<
    [SalesHeaderCanonicalField, readonly string[]]
  >) {
    for (const alias of aliases) {
      const key = normalizeLabel(alias);

      if (key && !lookup.has(key)) {
        lookup.set(key, canonical);
      }
    }
  }

  return lookup;
}

export function resolveCanonicalFieldForColumns(
  canonical: SalesHeaderCanonicalField,
  columnFields: ReadonlySet<string>,
): string | null {
  for (const field of CANONICAL_FIELD_TARGETS[canonical]) {
    if (columnFields.has(field)) {
      return field;
    }
  }

  return null;
}

export function mergeUniversalAliasesIntoIndex(
  index: Map<string, { field: string; required: boolean }>,
  columns: readonly { field: string; required: boolean }[],
  normalizeLabel: (value: string) => string,
): void {
  const columnFields = new Set(columns.map((column) => column.field));
  const requiredByField = new Map(columns.map((column) => [column.field, column.required]));
  const universalLookup = buildNormalizedUniversalAliasLookup(normalizeLabel);

  for (const [normalizedAlias, canonical] of universalLookup) {
    if (index.has(normalizedAlias)) {
      continue;
    }

    const field = resolveCanonicalFieldForColumns(canonical, columnFields);

    if (!field) {
      continue;
    }

    index.set(normalizedAlias, {
      field,
      required: requiredByField.get(field) ?? false,
    });
  }
}
