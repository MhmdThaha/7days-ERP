/**
 * Profile-aware Auto Mapping tests.
 */

import { describe, expect, it } from 'vitest';

import { PRODUCT_IMPORT_COLUMNS } from '@/lib/import/definitions/product.definition';
import { SALE_IMPORT_COLUMNS } from '@/lib/import/definitions/sale.definition';
import {
  PRODUCT_IMPORT_REPORT,
  SALES_DETAIL_REPORT,
  SALES_SUMMARY_REPORT,
  UNKNOWN_REPORT,
  createCapabilities,
  type ReportDefinition,
} from '@/lib/import/reports';
import { buildAutoMapping } from '@/lib/import/services/auto-mapping';
import type { ColumnDefinition } from '@/lib/import/engine/types';

describe('buildAutoMapping (profile-aware)', () => {
  it('1. Product Import maps correctly', () => {
    const result = buildAutoMapping(
      ['Product Name', 'Product Code', 'Selling Price', 'Unit', 'Category'],
      PRODUCT_IMPORT_COLUMNS,
      { profile: PRODUCT_IMPORT_REPORT },
    );

    expect(result.mapping.columnMappings).toEqual(
      expect.arrayContaining([
        { sourceHeader: 'Product Name', targetField: 'name' },
        { sourceHeader: 'Product Code', targetField: 'code' },
        { sourceHeader: 'Selling Price', targetField: 'sellingPrice' },
        { sourceHeader: 'Unit', targetField: 'unit' },
        { sourceHeader: 'Category', targetField: 'category' },
      ]),
    );
    expect(result.mappedFields).toHaveLength(5);
    expect(result.unmappedHeaders).toEqual([]);
    expect(result.ambiguousMappings).toEqual([]);
    expect(result.mappingConfidence).toBeGreaterThan(0.5);
    expect(result.explanation.some((line) => /Product Import/i.test(line))).toBe(true);
  });

  it('2. Sales Summary ignores product-related fields via mappingHints', () => {
    const result = buildAutoMapping(
      [
        'Invoice No',
        'Invoice Date',
        'Contact Name',
        'Amount',
        'Description',
        'Qty',
      ],
      SALE_IMPORT_COLUMNS,
      { profile: SALES_SUMMARY_REPORT },
    );

    const byHeader = Object.fromEntries(
      result.mappedFields.map((field) => [field.sourceHeader, field.targetField]),
    );

    expect(byHeader['Invoice No']).toBe('saleNumber');
    expect(byHeader['Invoice Date']).toBe('saleDate');
    expect(byHeader['Contact Name']).toBe('customerName');
    expect(byHeader['Amount']).toBe('sellingPrice');

    // Description → productName and Qty → quantity are ignored by profile hints.
    expect(result.ignoredHeaders).toEqual(expect.arrayContaining(['Description', 'Qty']));
    expect(result.mappedFields.some((field) => field.targetField === 'productName')).toBe(
      false,
    );
    expect(result.mappedFields.some((field) => field.targetField === 'quantity')).toBe(false);
    expect(SALES_SUMMARY_REPORT.mappingHints.ignoreFields).toEqual(
      expect.arrayContaining(['quantity', 'productName', 'productCode']),
    );
  });

  it('3. Sales Detail maps quantity, rate, and invoice number correctly', () => {
    const result = buildAutoMapping(
      ['Invoice No', 'Date', 'Party Name', 'Item Name', 'Qty', 'Rate'],
      SALE_IMPORT_COLUMNS,
      { profile: SALES_DETAIL_REPORT },
    );

    const byHeader = Object.fromEntries(
      result.mappedFields.map((field) => [field.sourceHeader, field.targetField]),
    );

    expect(byHeader['Invoice No']).toBe('saleNumber');
    expect(byHeader['Date']).toBe('saleDate');
    expect(byHeader['Party Name']).toBe('customerName');
    expect(byHeader['Item Name']).toBe('productName');
    expect(byHeader['Qty']).toBe('quantity');
    expect(byHeader['Rate']).toBe('sellingPrice');
    expect(result.ignoredHeaders).toEqual([]);
    expect(result.ambiguousMappings).toEqual([]);
    expect(result.mappingConfidence).toBeGreaterThan(0.5);
  });

  it('4. Unknown report produces low-confidence mapping', () => {
    const result = buildAutoMapping(
      ['Product Name', 'Selling Price'],
      PRODUCT_IMPORT_COLUMNS,
      { profile: UNKNOWN_REPORT },
    );

    // Entity aliases still match, but Unknown caps confidence.
    expect(result.mappedFields.length).toBeGreaterThan(0);
    expect(result.mappingConfidence).toBeLessThanOrEqual(0.35);
    expect(result.explanation.some((line) => /Unknown|no report profile|unknown/i.test(line))).toBe(
      true,
    );
  });

  it('5. Ambiguous headers are surfaced instead of picking randomly', () => {
    const columns: ColumnDefinition[] = [
      {
        field: 'alpha',
        label: 'Alpha',
        dataType: 'string',
        required: false,
        synonyms: ['Shared'],
      },
      {
        field: 'beta',
        label: 'Beta',
        dataType: 'string',
        required: false,
        synonyms: ['Shared'],
      },
    ];

    const result = buildAutoMapping(['Shared', 'Other'], columns, {
      profile: {
        ...UNKNOWN_REPORT,
        id: 'tie-test',
        displayName: 'Tie Test',
        reportType: 'unknown',
        mappingHints: {},
      },
    });

    expect(result.ambiguousMappings).toHaveLength(1);
    expect(result.ambiguousMappings[0]?.sourceHeader).toBe('Shared');
    expect(result.ambiguousMappings[0]?.candidates.map((c) => c.targetField).sort()).toEqual([
      'alpha',
      'beta',
    ]);
    expect(result.mapping.columnMappings.some((m) => m.sourceHeader === 'Shared')).toBe(false);
    expect(result.unmappedHeaders).toContain('Other');
  });

  it('6. preferredFieldOrder influences matching without hardcoding report names', () => {
    const columns: ColumnDefinition[] = [
      {
        field: 'alpha',
        label: 'Alpha',
        dataType: 'string',
        required: false,
        synonyms: ['Shared'],
      },
      {
        field: 'beta',
        label: 'Beta',
        dataType: 'string',
        required: false,
        synonyms: ['Shared'],
      },
    ];

    const preferBeta: ReportDefinition = {
      id: 'prefer-beta-shape',
      displayName: 'Prefer Beta Shape',
      supportedEntity: 'product',
      reportType: 'product-import',
      requiredFields: [],
      optionalFields: [],
      capabilities: createCapabilities(),
      recommendedImportMode: 'catalog-upsert',
      validationHints: {},
      mappingHints: {
        preferredFieldOrder: ['beta', 'alpha'],
      },
    };

    const preferAlpha: ReportDefinition = {
      ...preferBeta,
      id: 'prefer-alpha-shape',
      displayName: 'Prefer Alpha Shape',
      mappingHints: {
        preferredFieldOrder: ['alpha', 'beta'],
      },
    };

    const betaResult = buildAutoMapping(['Shared'], columns, { profile: preferBeta });
    const alphaResult = buildAutoMapping(['Shared'], columns, { profile: preferAlpha });

    expect(betaResult.mappedFields[0]?.targetField).toBe('beta');
    expect(alphaResult.mappedFields[0]?.targetField).toBe('alpha');
    expect(betaResult.ambiguousMappings).toEqual([]);
    expect(alphaResult.ambiguousMappings).toEqual([]);

    // Mapper must not branch on these ids — only hints differ.
    expect(preferBeta.id).not.toBe(preferAlpha.id);
  });

  it('accepts a ReportDefinition directly as the third argument', () => {
    const result = buildAutoMapping(
      ['Item Name', 'Sale Price'],
      PRODUCT_IMPORT_COLUMNS,
      PRODUCT_IMPORT_REPORT,
    );

    expect(result.mappedFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceHeader: 'Item Name', targetField: 'name' }),
        expect.objectContaining({ sourceHeader: 'Sale Price', targetField: 'sellingPrice' }),
      ]),
    );
  });

  it('documents example AutoMappingResult shapes', () => {
    const product = buildAutoMapping(
      ['Product Name', 'Product Code', 'Selling Price'],
      PRODUCT_IMPORT_COLUMNS,
      { profile: PRODUCT_IMPORT_REPORT },
    );
    const salesSummary = buildAutoMapping(
      ['Invoice No', 'Invoice Date', 'Amount', 'Description'],
      SALE_IMPORT_COLUMNS,
      { profile: SALES_SUMMARY_REPORT },
    );
    const salesDetail = buildAutoMapping(
      ['Date', 'Item Name', 'Qty', 'Rate', 'Invoice No'],
      SALE_IMPORT_COLUMNS,
      { profile: SALES_DETAIL_REPORT },
    );

    expect({
      product: {
        mapped: product.mappedFields.map((f) => `${f.sourceHeader}→${f.targetField}`),
        confidence: product.mappingConfidence,
        ignored: product.ignoredHeaders,
        ambiguous: product.ambiguousMappings,
      },
      salesSummary: {
        mapped: salesSummary.mappedFields.map((f) => `${f.sourceHeader}→${f.targetField}`),
        ignored: salesSummary.ignoredHeaders,
        confidence: salesSummary.mappingConfidence,
      },
      salesDetail: {
        mapped: salesDetail.mappedFields.map((f) => `${f.sourceHeader}→${f.targetField}`),
        confidence: salesDetail.mappingConfidence,
      },
    }).toEqual({
      product: {
        mapped: expect.arrayContaining([
          'Product Name→name',
          'Product Code→code',
          'Selling Price→sellingPrice',
        ]),
        confidence: expect.any(Number),
        ignored: [],
        ambiguous: [],
      },
      salesSummary: {
        mapped: expect.arrayContaining([
          'Invoice No→saleNumber',
          'Invoice Date→saleDate',
          'Amount→sellingPrice',
        ]),
        ignored: ['Description'],
        confidence: expect.any(Number),
      },
      salesDetail: {
        mapped: expect.arrayContaining([
          'Date→saleDate',
          'Item Name→productName',
          'Qty→quantity',
          'Rate→sellingPrice',
          'Invoice No→saleNumber',
        ]),
        confidence: expect.any(Number),
      },
    });
  });
});
