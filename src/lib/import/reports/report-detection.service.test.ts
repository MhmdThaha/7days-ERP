/**
 * Report Definition / Profile tests — detection returns the full profile.
 */

import { describe, expect, it } from 'vitest';

import {
  EMPTY_CAPABILITIES,
  ITEM_SUMMARY_REPORT,
  PRODUCT_IMPORT_REPORT,
  SALES_DETAIL_REPORT,
  SALES_SUMMARY_REPORT,
  UNKNOWN_REPORT,
  calculateDefaultConfidence,
  createCapabilities,
  detectReport,
  type ReportDefinition,
} from '@/lib/import/reports';
import { prepareImportFile } from '@/lib/import/services/import.service';

function csvBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** Minimal profile for isolated scoring tests. */
function testProfile(
  partial: Pick<ReportDefinition, 'id' | 'displayName' | 'supportedEntity'> &
    Partial<ReportDefinition>,
): ReportDefinition {
  return {
    reportType: 'unknown',
    requiredFields: [],
    optionalFields: [],
    capabilities: EMPTY_CAPABILITIES,
    recommendedImportMode: 'review-only',
    validationHints: {},
    mappingHints: {},
    ...partial,
  };
}

describe('detectReport — full profile return', () => {
  it('1. Product Import returns the Product Import profile', () => {
    const result = detectReport(
      ['Product Name', 'Product Code', 'Selling Price', 'Unit', 'Category'],
      { entityType: 'product' },
    );

    expect(result.profile).toBe(PRODUCT_IMPORT_REPORT);
    expect(result.profile.id).toBe('product-import');
    expect(result.profile.reportType).toBe('product-import');
    expect(result.reportType).toBe('product-import');
    expect(result.matchedColumns.some((column) => column.key === 'name')).toBe(true);
    expect(result.profile.recommendedImportMode).toBe('catalog-upsert');
    expect(result.profile.capabilities.supportsProductImport).toBe(true);
    expect(result.profile.capabilities.supportsInventory).toBe(true);
    expect(result.profile.mappingHints.preferredFieldOrder).toContain('name');
    expect(result.confidence).toBeGreaterThanOrEqual(0.4);
    expect(result.missingHeaders).toEqual([]);
  });

  it('2. Sales Summary returns the Sales Summary profile', () => {
    const result = detectReport(
      [
        'Invoice No',
        'Invoice Date',
        'Contact Name',
        'Amount',
        'Remaining Amount',
        'Invoice Status',
        'Payment Type',
      ],
      { entityType: 'sale' },
    );

    expect(result.profile).toBe(SALES_SUMMARY_REPORT);
    expect(result.profile.id).toBe('sales-summary');
    expect(result.profile.reportType).toBe('sales-summary');
    expect(result.profile.recommendedImportMode).toBe('document-history');
    expect(result.profile.capabilities.supportsInvoiceHistory).toBe(true);
    expect(result.profile.capabilities.supportsFinancialHistory).toBe(true);
    expect(result.profile.capabilities.supportsInventory).toBe(false);
    expect(result.profile.validationHints.allowInventoryMutation).toBe(false);
    expect(result.confidence).toBeGreaterThanOrEqual(0.4);

    const detailCandidate = result.candidates.find((c) => c.definitionId === 'sales-detail');
    expect(detailCandidate).toBeDefined();
    expect(result.confidence).toBeGreaterThan(detailCandidate!.confidence);
  });

  it('3. Sales Detail returns the Sales Detail profile', () => {
    const result = detectReport(
      ['Invoice No', 'Date', 'Party Name', 'Item Name', 'Qty', 'Rate'],
      { entityType: 'sale' },
    );

    expect(result.profile).toBe(SALES_DETAIL_REPORT);
    expect(result.profile.id).toBe('sales-detail');
    expect(result.profile.reportType).toBe('sales-detail');
    expect(result.profile.recommendedImportMode).toBe('line-item-commit');
    expect(result.profile.capabilities.supportsInventory).toBe(true);
    expect(result.profile.capabilities.supportsInvoiceHistory).toBe(true);
    expect(result.profile.validationHints.requireProductReference).toBe(true);
    expect(result.profile.validationHints.requirePositiveQuantity).toBe(true);
    expect(result.profile.mappingHints.synonymBoosts?.Qty).toBe('quantity');
    expect(result.missingHeaders).toEqual([]);
  });

  it('4. Item Summary returns the Item Summary profile', () => {
    const result = detectReport(['Item Name', 'Item Code', 'Qty Sold', 'Amount'], {
      entityType: 'product',
    });

    expect(result.profile).toBe(ITEM_SUMMARY_REPORT);
    expect(result.profile.id).toBe('item-summary');
    expect(result.profile.reportType).toBe('item-summary');
    expect(result.profile.recommendedImportMode).toBe('item-aggregate');
    expect(result.profile.capabilities.supportsFinancialHistory).toBe(true);
    expect(result.profile.capabilities.supportsInventory).toBe(false);
    expect(result.profile.validationHints.allowInventoryMutation).toBe(false);
    expect(result.confidence).toBeGreaterThanOrEqual(0.4);
  });

  it('5. Unknown returns the Unknown profile', () => {
    const result = detectReport(['Foo', 'Bar', 'Baz', 'Qux'], { entityType: 'sale' });

    expect(result.profile).toBe(UNKNOWN_REPORT);
    expect(result.profile.id).toBe('unknown');
    expect(result.profile.reportType).toBe('unknown');
    expect(result.profile.recommendedImportMode).toBe('review-only');
    expect(result.profile.capabilities).toEqual(EMPTY_CAPABILITIES);
    expect(result.profile.validationHints.allowInventoryMutation).toBe(false);
    expect(result.confidence).toBeLessThan(0.4);
    expect(result.unmatchedHeaders).toEqual(['Foo', 'Bar', 'Baz', 'Qux']);
  });

  it('6. Capabilities are exposed correctly on the returned profile', () => {
    const product = detectReport(['Product Name', 'Selling Price'], {
      entityType: 'product',
    });
    const salesSummary = detectReport(
      ['Invoice No', 'Invoice Date', 'Amount'],
      { entityType: 'sale' },
    );
    const salesDetail = detectReport(['Date', 'Item Name', 'Qty'], {
      entityType: 'sale',
    });
    const purchase = detectReport(
      ['Bill Date', 'Supplier', 'Item Name', 'Qty', 'Rate'],
      { entityType: 'purchase' },
    );

    expect(product.profile.capabilities).toEqual(
      createCapabilities({
        supportsProductImport: true,
        supportsInventory: true,
      }),
    );
    expect(salesSummary.profile.capabilities.supportsInvoiceHistory).toBe(true);
    expect(salesSummary.profile.capabilities.supportsInventory).toBe(false);
    expect(salesDetail.profile.capabilities.supportsInventory).toBe(true);
    expect(purchase.profile.capabilities.supportsPurchaseImport).toBe(true);
    expect(purchase.profile.capabilities.supportsInventory).toBe(true);

    // Full profile fields available for later phases
    expect(product.profile.validationHints).toBeDefined();
    expect(product.profile.mappingHints).toBeDefined();
    expect(product.profile.requiredFields.length).toBeGreaterThan(0);
  });

  it('selects the highest-confidence definition when two are similar', () => {
    const weak = testProfile({
      id: 'weak-sale',
      displayName: 'Weak Sale Shape',
      supportedEntity: 'sale',
      reportType: 'sales-summary',
      recommendedImportMode: 'document-history',
      requiredFields: [
        { key: 'saleDate', label: 'Date', aliases: ['Date', 'Sale Date'] },
      ],
      optionalFields: [{ key: 'notes', label: 'Notes', aliases: ['Notes'] }],
    });

    const strong = testProfile({
      id: 'strong-sale',
      displayName: 'Strong Sale Shape',
      supportedEntity: 'sale',
      reportType: 'sales-detail',
      recommendedImportMode: 'line-item-commit',
      capabilities: createCapabilities({ supportsInventory: true }),
      requiredFields: [
        { key: 'saleDate', label: 'Date', aliases: ['Date', 'Sale Date'] },
        { key: 'quantity', label: 'Quantity', aliases: ['Quantity', 'Qty'] },
        { key: 'product', label: 'Product', aliases: ['Item Name', 'Product Name'] },
      ],
      optionalFields: [
        { key: 'customerName', label: 'Customer', aliases: ['Party Name', 'Customer'] },
        { key: 'rate', label: 'Rate', aliases: ['Rate', 'Price'] },
      ],
    });

    const result = detectReport(
      ['Date', 'Party Name', 'Item Name', 'Qty', 'Rate'],
      { entityType: 'sale', definitions: [weak, strong] },
    );

    expect(result.profile.id).toBe('strong-sale');
    expect(result.profile).toBe(strong);
    expect(result.confidence).toBeGreaterThan(
      result.candidates.find((c) => c.definitionId === 'weak-sale')!.confidence,
    );
  });

  it('lowers confidence when required fields are missing', () => {
    const complete = detectReport(
      ['Invoice No', 'Invoice Date', 'Amount', 'Party Name'],
      { entityType: 'sale', definitions: [SALES_SUMMARY_REPORT] },
    );

    const incomplete = detectReport(
      ['Invoice No', 'Party Name', 'Remaining Amount'],
      { entityType: 'sale', definitions: [SALES_SUMMARY_REPORT] },
    );

    const incompleteCandidate = incomplete.candidates.find(
      (c) => c.definitionId === 'sales-summary',
    );

    expect(complete.profile.id).toBe('sales-summary');
    expect(incompleteCandidate).toBeDefined();
    expect(incompleteCandidate!.confidence).toBeLessThan(complete.confidence);
    expect(incomplete.profile).toBe(UNKNOWN_REPORT);
  });

  it('does not embed vendor names in profile identity', () => {
    const result = detectReport(
      ['Invoice No', 'Invoice Date', 'Amount', 'Contact Name'],
      { entityType: 'sale' },
    );

    const blob = [
      result.profile.id,
      result.profile.displayName,
      result.profile.reportType,
      result.reportType,
      ...result.explanation,
    ]
      .join(' ')
      .toLowerCase();

    expect(blob).not.toMatch(/mybillbook|vyapar|tally|busy|marg/);
  });
});

describe('detectReport — vendor-shaped exports without vendor hardcoding', () => {
  it('classifies invoice-summary exports with Contact Name and Remaining Amount', () => {
    const result = detectReport(
      [
        'Invoice No',
        'Invoice Date',
        'Contact Name',
        'Amount',
        'Remaining Amount',
        'Invoice Status',
        'Payment Type',
      ],
      { entityType: 'sale' },
    );

    expect(result.reportType).toBe('sales-summary');
    expect(result.confidence).toBeGreaterThanOrEqual(0.4);
    expect(result.matchedColumns.map((column) => column.key)).toEqual(
      expect.arrayContaining(['saleNumber', 'saleDate', 'amount']),
    );
  });

  it('classifies line-item exports with Party Name, Description, and Sales Qty.', () => {
    const result = detectReport(
      ['Date', 'Party Name', 'Invoice No.', 'Description', 'Sales Qty.', 'Rate'],
      { entityType: 'sale' },
    );

    expect(result.reportType).toBe('sales-detail');
    expect(result.matchedColumns.map((column) => column.key)).toEqual(
      expect.arrayContaining(['saleDate', 'quantity', 'product']),
    );
    expect(result.matchedColumns.find((column) => column.header === 'Sales Qty.')?.similarity).toBe(1);
  });

  it('classifies voucher-style headers via universal aliases', () => {
    const result = detectReport(
      ['Voucher No', 'Voucher Date', 'Party Name', 'Item Name', 'Qty', 'Net Amount'],
      { entityType: 'sale' },
    );

    expect(result.reportType).toBe('sales-detail');
    expect(result.matchedColumns.map((column) => column.key)).toEqual(
      expect.arrayContaining(['saleDate', 'quantity', 'product']),
    );
  });

  it('reports missing sale date when only product and quantity are present', () => {
    const result = detectReport(['Item Name', 'Qty Sold'], { entityType: 'sale' });

    expect(result.reportType).toBe('unknown');
    expect(result.missingColumns.some((column) => column.key === 'saleDate' && column.required)).toBe(
      true,
    );
    expect(result.matchedColumns.map((column) => column.key)).toEqual(
      expect.arrayContaining(['quantity', 'product']),
    );
  });

  it('keeps extra columns as unmatched without breaking classification', () => {
    const result = detectReport(
      [
        'Invoice No',
        'Date',
        'Party Name',
        'Item Name',
        'Qty',
        'Rate',
        'Phone No.',
        'GSTIN',
        'PO Number',
      ],
      { entityType: 'sale' },
    );

    expect(result.reportType).toBe('sales-detail');
    expect(result.unmatchedHeaders.length).toBeGreaterThan(0);
    expect(result.matchedColumns.length).toBeGreaterThanOrEqual(4);
  });

  it('classifies generic product + quantity aggregate exports for product entity', () => {
    const result = detectReport(['Item Name', 'Qty Sold', 'Net Amount', 'Notes'], {
      entityType: 'product',
    });

    expect(result.reportType).toBe('item-summary');
    expect(result.matchedColumns.map((column) => column.key)).toEqual(
      expect.arrayContaining(['name', 'quantity']),
    );
  });

  it('returns unknown for unrecognized generic spreadsheets', () => {
    const result = detectReport(['Column A', 'Column B', 'Foo', 'Bar'], { entityType: 'sale' });

    expect(result.reportType).toBe('unknown');
    expect(result.confidence).toBeLessThan(0.4);
    expect(result.missingColumns.length).toBeGreaterThan(0);
  });

  it('exposes matchedColumns and missingColumns on the detection result', () => {
    const result = detectReport(['Invoice No', 'Party Name', 'Remaining Amount'], {
      entityType: 'sale',
    });

    expect(result.matchedColumns.every((column) => column.header && column.key)).toBe(true);
    expect(result.missingColumns.some((column) => column.key === 'saleDate' && column.required)).toBe(
      true,
    );
    expect(result.reportType).toBe('unknown');
  });
});

describe('calculateDefaultConfidence', () => {
  it('applies missingRequiredFactor when required fields are absent', () => {
    const fullCoverage = {
      matchedRequiredKeys: ['name'],
      missingRequiredKeys: [] as string[],
      matchedOptionalKeys: ['code', 'sellingPrice'],
      unmatchedFileHeaders: [] as string[],
      matchedFileHeaders: ['Product Name', 'Product Code', 'Selling Price'],
      matchedColumns: [] as const,
      missingColumns: [] as const,
      requiredTotal: 1,
      optionalTotal: PRODUCT_IMPORT_REPORT.optionalFields.length,
      fileHeaderTotal: 3,
    };

    const partialCoverage = {
      ...fullCoverage,
      matchedRequiredKeys: [] as string[],
      missingRequiredKeys: ['name'],
      matchedOptionalKeys: ['code'],
      matchedFileHeaders: ['Product Code'],
      fileHeaderTotal: 1,
    };

    const full = calculateDefaultConfidence(PRODUCT_IMPORT_REPORT, fullCoverage);
    const partial = calculateDefaultConfidence(PRODUCT_IMPORT_REPORT, partialCoverage);

    expect(full).toBeGreaterThan(partial);
    expect(partial).toBeLessThan(0.4);
  });
});

describe('prepareImportFile profile integration', () => {
  it('attaches the Product Import profile after header detection', () => {
    const csv = [
      'Product Name,Product Code,Selling Price,Unit',
      'Milk Bread,BRD-001,45,pcs',
    ].join('\n');

    const prepared = prepareImportFile(csvBytes(csv), 'product', {
      fileName: 'products.csv',
    });

    expect(prepared.reportDetection.profile).toBe(PRODUCT_IMPORT_REPORT);
    expect(prepared.reportDetection.profile.capabilities.supportsProductImport).toBe(true);
  });

  it('attaches the Sales Summary profile on a preamble-heavy CSV', () => {
    const csv = [
      'Bakery Name',
      'Phone No: 123',
      '',
      'Sales Summary Report',
      '',
      'Invoice No,Invoice Date,Contact Name,Amount,Remaining Amount,Invoice Status',
      'INV-1,01/07/2026,Walk-in,100,0,Paid',
    ].join('\n');

    const prepared = prepareImportFile(csvBytes(csv), 'sale', {
      fileName: 'sales-summary.csv',
    });

    expect(prepared.reportDetection.profile).toBe(SALES_SUMMARY_REPORT);
    expect(prepared.reportDetection.profile.recommendedImportMode).toBe('document-history');
  });
});

describe('example profile objects', () => {
  it('documents the shape returned for each report type', () => {
    const examples = {
      productImport: detectReport(['Product Name', 'Product Code', 'Selling Price', 'Unit'], {
        entityType: 'product',
      }).profile,
      itemSummary: detectReport(['Item Name', 'Qty Sold', 'Amount'], {
        entityType: 'product',
      }).profile,
      salesDetail: detectReport(['Date', 'Item Name', 'Qty', 'Rate', 'Invoice No'], {
        entityType: 'sale',
      }).profile,
      salesSummary: detectReport(['Invoice No', 'Invoice Date', 'Amount', 'Party Name'], {
        entityType: 'sale',
      }).profile,
      unknown: detectReport(['Alpha', 'Beta'], { entityType: 'sale' }).profile,
    };

    expect(examples.productImport).toMatchObject({
      id: 'product-import',
      reportType: 'product-import',
      recommendedImportMode: 'catalog-upsert',
      capabilities: {
        supportsProductImport: true,
        supportsInventory: true,
        supportsInvoiceHistory: false,
      },
    });

    expect(examples.itemSummary).toMatchObject({
      id: 'item-summary',
      reportType: 'item-summary',
      recommendedImportMode: 'item-aggregate',
      capabilities: { supportsInventory: false, supportsFinancialHistory: true },
    });

    expect(examples.salesDetail).toMatchObject({
      id: 'sales-detail',
      reportType: 'sales-detail',
      recommendedImportMode: 'line-item-commit',
      capabilities: { supportsInventory: true, supportsInvoiceHistory: true },
      validationHints: { requireProductReference: true, requirePositiveQuantity: true },
    });

    expect(examples.salesSummary).toMatchObject({
      id: 'sales-summary',
      reportType: 'sales-summary',
      recommendedImportMode: 'document-history',
      capabilities: { supportsInventory: false, supportsInvoiceHistory: true },
      validationHints: { allowInventoryMutation: false },
    });

    expect(examples.unknown).toMatchObject({
      id: 'unknown',
      reportType: 'unknown',
      recommendedImportMode: 'review-only',
      capabilities: EMPTY_CAPABILITIES,
    });

    // ReportProfile alias is the same type as ReportDefinition
    const profile: typeof examples.productImport = PRODUCT_IMPORT_REPORT;
    expect(profile.id).toBe('product-import');
  });
});
