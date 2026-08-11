/**
 * Built-in Report Definitions / Profiles.
 *
 * Structure + business meaning in one object. No vendor names.
 * Adding a new report = add a definition here and register it.
 */

import {
  createCapabilities,
  type ReportDefinition,
} from '@/lib/import/reports/types';

export const PRODUCT_IMPORT_REPORT: ReportDefinition = {
  id: 'product-import',
  displayName: 'Product Import',
  supportedEntity: 'product',
  reportType: 'product-import',
  capabilities: createCapabilities({
    supportsProductImport: true,
    supportsInventory: true,
  }),
  recommendedImportMode: 'catalog-upsert',
  validationHints: {
    allowInventoryMutation: true,
    preferCreateOverUpdate: false,
    issueCodes: ['PRODUCT_IMPORT'],
  },
  mappingHints: {
    preferredFieldOrder: [
      'name',
      'code',
      'sellingPrice',
      'costPrice',
      'unit',
      'category',
      'gstRate',
      'openingStock',
      'minimumStock',
    ],
    requiredFieldPriority: ['name', 'sellingPrice'],
    synonymBoosts: {
      'Item Name': 'name',
      'Sale Price': 'sellingPrice',
      'Purchase Price': 'costPrice',
    },
  },
  requiredFields: [
    {
      key: 'name',
      label: 'Product Name',
      aliases: ['Product Name', 'Item Name', 'Name', 'Product', 'Item', 'Item Title'],
    },
  ],
  optionalFields: [
    {
      key: 'code',
      label: 'Product Code',
      aliases: ['Product Code', 'Item Code', 'Code', 'SKU', 'Barcode', 'Product ID'],
    },
    {
      key: 'sellingPrice',
      label: 'Selling Price',
      aliases: [
        'Selling Price',
        'Sale Price',
        'Rate',
        'MRP',
        'Price',
        'Sales Price',
        'Sale Rate',
        'Retail Price',
      ],
    },
    {
      key: 'costPrice',
      label: 'Cost Price',
      aliases: [
        'Cost Price',
        'Purchase Price',
        'Cost',
        'Buy Price',
        'Purchase Rate',
        'Avg Cost',
        'Average Cost',
      ],
    },
    {
      key: 'unit',
      label: 'Unit',
      aliases: ['Unit', 'UOM', 'Base Unit', 'Primary Unit', 'Units', 'Measuring Unit'],
    },
    {
      key: 'category',
      label: 'Category',
      aliases: ['Category', 'Item Category', 'Product Category', 'Group', 'Item Group'],
    },
    {
      key: 'gstRate',
      label: 'GST',
      aliases: ['GST', 'GST %', 'GST Rate', 'Tax', 'Tax Rate', 'Tax %', 'GST Percentage'],
    },
    {
      key: 'openingStock',
      label: 'Opening Stock',
      aliases: [
        'Opening Stock',
        'Stock',
        'Current Stock',
        'Stock Qty',
        'Opening Qty',
        'Qty',
        'Quantity',
      ],
    },
    {
      key: 'minimumStock',
      label: 'Minimum Stock',
      aliases: [
        'Minimum Stock',
        'Min Stock',
        'Reorder Level',
        'Min Qty',
        'Low Stock Alert',
        'Reorder Point',
      ],
    },
  ],
  confidence: {
    requiredWeight: 0.55,
    optionalWeight: 0.4,
    matchedFileWeight: 0.05,
    missingRequiredFactor: 0.4,
  },
};

/** Aggregated item totals (name + quantity) without full catalog pricing. */
export const ITEM_SUMMARY_REPORT: ReportDefinition = {
  id: 'item-summary',
  displayName: 'Item Summary',
  supportedEntity: 'product',
  reportType: 'item-summary',
  capabilities: createCapabilities({
    supportsFinancialHistory: true,
    supportsInventory: false,
  }),
  recommendedImportMode: 'item-aggregate',
  validationHints: {
    allowInventoryMutation: false,
    requirePositiveQuantity: true,
    issueCodes: ['ITEM_SUMMARY_NO_INVENTORY'],
  },
  mappingHints: {
    preferredFieldOrder: ['name', 'code', 'quantity', 'amount', 'rate'],
    requiredFieldPriority: ['name', 'quantity'],
    ignoreFields: ['sellingPrice', 'costPrice', 'gstRate'],
  },
  requiredFields: [
    {
      key: 'name',
      label: 'Item Name',
      aliases: ['Item Name', 'Product Name', 'Name', 'Product', 'Item', 'Item Title'],
    },
    {
      key: 'quantity',
      label: 'Quantity',
      aliases: [
        'Quantity',
        'Qty',
        'QTY',
        'Qty Sold',
        'Quantity Sold',
        'Units Sold',
        'Sold Qty',
        'Stock',
      ],
    },
  ],
  optionalFields: [
    {
      key: 'code',
      label: 'Item Code',
      aliases: ['Item Code', 'Product Code', 'Code', 'SKU', 'Barcode'],
    },
    {
      key: 'amount',
      label: 'Amount',
      aliases: ['Amount', 'Total Amount', 'Sales Amount', 'Value', 'Total'],
    },
    {
      key: 'rate',
      label: 'Rate',
      aliases: ['Rate', 'Price', 'Unit Price', 'Avg Rate'],
    },
  ],
  confidence: {
    requiredWeight: 0.7,
    optionalWeight: 0.25,
    matchedFileWeight: 0.05,
    missingRequiredFactor: 0.4,
  },
};

/** Line-per-row sales with product reference and quantity. */
export const SALES_DETAIL_REPORT: ReportDefinition = {
  id: 'sales-detail',
  displayName: 'Sales Detail',
  supportedEntity: 'sale',
  reportType: 'sales-detail',
  capabilities: createCapabilities({
    supportsInventory: true,
    supportsInvoiceHistory: true,
    supportsFinancialHistory: true,
  }),
  recommendedImportMode: 'line-item-commit',
  validationHints: {
    requireProductReference: true,
    requirePositiveQuantity: true,
    allowInventoryMutation: true,
    issueCodes: ['SALES_DETAIL'],
  },
  mappingHints: {
    preferredFieldOrder: [
      'saleDate',
      'quantity',
      'productName',
      'productCode',
      'saleNumber',
      'customerName',
      'sellingPrice',
      'amount',
      'notes',
    ],
    requiredFieldPriority: ['saleDate', 'quantity', 'productName', 'productCode'],
    synonymBoosts: {
      Description: 'productName',
      Qty: 'quantity',
      Rate: 'sellingPrice',
      'Invoice No': 'saleNumber',
      'Invoice No.': 'saleNumber',
    },
  },
  requiredFields: [
    {
      key: 'saleDate',
      label: 'Sale Date',
      aliases: ['Sale Date', 'Date', 'Invoice Date', 'Bill Date', 'Sales Date', 'Transaction Date'],
    },
    {
      key: 'quantity',
      label: 'Quantity',
      aliases: ['Quantity', 'Qty', 'QTY', 'Units', 'Unit Qty', 'Sale Qty'],
    },
    {
      key: 'product',
      label: 'Product Name / Code',
      aliases: [
        'Product Name',
        'Item Name',
        'Name',
        'Product',
        'Item',
        'Item Title',
        'Description',
        'Product Code',
        'Item Code',
        'SKU',
        'Barcode',
        'Code',
      ],
    },
  ],
  optionalFields: [
    {
      key: 'saleNumber',
      label: 'Sale Number',
      aliases: [
        'Sale Number',
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
      key: 'customerName',
      label: 'Customer Name',
      aliases: [
        'Customer Name',
        'Customer',
        'Party Name',
        'Party',
        'Buyer',
        'Client Name',
        'Client',
        'Contact Name',
      ],
    },
    {
      key: 'sellingPrice',
      label: 'Unit selling price',
      aliases: [
        'Selling Price',
        'Rate',
        'Sale Price',
        'Unit Price',
        'MRP',
        'Selling Rate',
        'Price / Unit',
      ],
    },
    {
      key: 'amount',
      label: 'Line total (amount)',
      aliases: [
        'Amount',
        'Net Amount',
        'Sales Amount',
        'Sales Amt',
        'Sales Amt.',
        'Line Total',
        'Total Amount',
        'Sale Value',
        'Gross Amount',
      ],
    },
    {
      key: 'notes',
      label: 'Notes',
      aliases: ['Notes', 'Remarks', 'Note', 'Comment', 'Comments', 'Narration'],
    },
  ],
  confidence: {
    requiredWeight: 0.7,
    optionalWeight: 0.25,
    matchedFileWeight: 0.05,
    missingRequiredFactor: 0.4,
  },
};

/** Invoice-level sales totals without line-item quantity / product. */
export const SALES_SUMMARY_REPORT: ReportDefinition = {
  id: 'sales-summary',
  displayName: 'Sales Summary',
  supportedEntity: 'sale',
  reportType: 'sales-summary',
  capabilities: createCapabilities({
    supportsInvoiceHistory: true,
    supportsFinancialHistory: true,
    supportsInventory: false,
  }),
  recommendedImportMode: 'document-history',
  validationHints: {
    allowInventoryMutation: false,
    requireProductReference: false,
    requirePositiveQuantity: false,
    issueCodes: ['SALES_SUMMARY_NO_INVENTORY'],
  },
  mappingHints: {
    preferredFieldOrder: ['saleNumber', 'saleDate', 'amount', 'customerName'],
    requiredFieldPriority: ['saleNumber', 'saleDate'],
    // No line-item inventory fields on invoice-level summaries.
    ignoreFields: ['quantity', 'productName', 'productCode', 'sellingPrice'],
    synonymBoosts: {
      'Invoice No': 'saleNumber',
      'Invoice No.': 'saleNumber',
      'Total Amount': 'amount',
      Amount: 'amount',
      'Contact Name': 'customerName',
    },
  },
  requiredFields: [
    {
      key: 'saleNumber',
      label: 'Invoice / Sale Number',
      aliases: [
        'Sale Number',
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
      key: 'saleDate',
      label: 'Sale Date',
      aliases: ['Sale Date', 'Date', 'Invoice Date', 'Bill Date', 'Sales Date', 'Transaction Date'],
    },
    {
      key: 'amount',
      label: 'Amount',
      aliases: [
        'Amount',
        'Total Amount',
        'Invoice Amount',
        'Grand Total',
        'Net Amount',
        'Sales Amount',
      ],
    },
  ],
  optionalFields: [
    {
      key: 'customerName',
      label: 'Customer Name',
      aliases: [
        'Customer Name',
        'Customer',
        'Party Name',
        'Party',
        'Buyer',
        'Client Name',
        'Client',
        'Contact Name',
      ],
    },
    {
      key: 'status',
      label: 'Invoice Status',
      aliases: ['Invoice Status', 'Status', 'Payment Status'],
    },
    {
      key: 'paymentType',
      label: 'Payment Type',
      aliases: ['Payment Type', 'Payment Mode', 'Mode'],
    },
    {
      key: 'balance',
      label: 'Balance',
      aliases: ['Balance Amount', 'Remaining Amount', 'Balance', 'Due Amount'],
    },
  ],
  confidence: {
    requiredWeight: 0.7,
    optionalWeight: 0.25,
    matchedFileWeight: 0.05,
    missingRequiredFactor: 0.4,
  },
};

/** Purchase line-item structure (registered for future purchase imports). */
export const PURCHASE_DETAIL_REPORT: ReportDefinition = {
  id: 'purchase-detail',
  displayName: 'Purchase Detail',
  supportedEntity: 'purchase',
  reportType: 'purchase-detail',
  capabilities: createCapabilities({
    supportsPurchaseImport: true,
    supportsInventory: true,
    supportsFinancialHistory: true,
  }),
  recommendedImportMode: 'purchase-line-commit',
  validationHints: {
    requirePositiveQuantity: true,
    allowInventoryMutation: true,
    issueCodes: ['PURCHASE_DETAIL'],
  },
  mappingHints: {
    preferredFieldOrder: [
      'purchaseDate',
      'quantity',
      'item',
      'purchaseNumber',
      'supplierName',
      'rate',
      'amount',
    ],
  },
  requiredFields: [
    {
      key: 'purchaseDate',
      label: 'Purchase Date',
      aliases: [
        'Purchase Date',
        'Bill Date',
        'Date',
        'Invoice Date',
        'Receipt Date',
        'Transaction Date',
      ],
    },
    {
      key: 'quantity',
      label: 'Quantity',
      aliases: ['Quantity', 'Qty', 'QTY', 'Units', 'Unit Qty', 'Purchase Qty'],
    },
    {
      key: 'item',
      label: 'Item Name / Code',
      aliases: [
        'Item Name',
        'Raw Material',
        'Material Name',
        'Product Name',
        'Name',
        'Item',
        'Description',
        'Item Code',
        'Material Code',
        'SKU',
        'Code',
      ],
    },
  ],
  optionalFields: [
    {
      key: 'purchaseNumber',
      label: 'Purchase / Bill Number',
      aliases: [
        'Purchase Number',
        'Bill No',
        'Bill Number',
        'Invoice No',
        'Invoice Number',
        'PO Number',
        'Purchase No',
      ],
    },
    {
      key: 'supplierName',
      label: 'Supplier Name',
      aliases: ['Supplier Name', 'Supplier', 'Vendor', 'Party Name', 'Party'],
    },
    {
      key: 'rate',
      label: 'Rate',
      aliases: ['Rate', 'Price', 'Unit Price', 'Cost', 'Purchase Price'],
    },
    {
      key: 'amount',
      label: 'Amount',
      aliases: ['Amount', 'Total Amount', 'Line Total'],
    },
  ],
  confidence: {
    requiredWeight: 0.7,
    optionalWeight: 0.25,
    matchedFileWeight: 0.05,
    missingRequiredFactor: 0.4,
  },
};

/** Default registry — order does not matter; scoring picks the winner. */
export const BUILTIN_REPORT_DEFINITIONS: readonly ReportDefinition[] = [
  PRODUCT_IMPORT_REPORT,
  ITEM_SUMMARY_REPORT,
  SALES_DETAIL_REPORT,
  SALES_SUMMARY_REPORT,
  PURCHASE_DETAIL_REPORT,
];
