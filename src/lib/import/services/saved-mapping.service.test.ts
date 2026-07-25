/**
 * Saved Mapping service tests — pure merge with Auto Mapping.
 */

import { describe, expect, it } from 'vitest';

import { PRODUCT_IMPORT_COLUMNS } from '@/lib/import/definitions/product.definition';
import { SALE_IMPORT_COLUMNS } from '@/lib/import/definitions/sale.definition';
import {
  PRODUCT_IMPORT_REPORT,
  SALES_DETAIL_REPORT,
  SALES_SUMMARY_REPORT,
} from '@/lib/import/reports';
import { buildAutoMapping } from '@/lib/import/services/auto-mapping';
import {
  applySavedMapping,
  buildSavedMappingDocument,
  savedMappingDocId,
} from '@/lib/import/services/saved-mapping.service';
import {
  SAVED_MAPPING_SCHEMA_VERSION,
  type SavedMappingDocument,
} from '@/lib/import/saved-mapping/types';

function savedDoc(
  overrides: Partial<SavedMappingDocument> &
    Pick<SavedMappingDocument, 'entity' | 'reportType' | 'mappings'>,
): SavedMappingDocument {
  const now = new Date('2026-07-01T00:00:00.000Z');

  return {
    organizationId: 'org-1',
    version: SAVED_MAPPING_SCHEMA_VERSION,
    createdAt: now,
    lastUsedAt: now,
    ...overrides,
  };
}

describe('applySavedMapping', () => {
  it('1. applies a Saved Mapping correctly (overrides auto where both exist)', () => {
    const headers = ['Item Name', 'SKU', 'Sale Price', 'Unit'];
    const autoMapping = buildAutoMapping(headers, PRODUCT_IMPORT_COLUMNS, {
      profile: PRODUCT_IMPORT_REPORT,
    });

    // Saved prefers "SKU" → code even if auto would also map it.
    const saved = savedDoc({
      entity: 'product',
      reportType: 'product-import',
      mappings: [
        { sourceHeader: 'Item Name', targetField: 'name' },
        { sourceHeader: 'SKU', targetField: 'code' },
        { sourceHeader: 'Sale Price', targetField: 'sellingPrice' },
      ],
    });

    const result = applySavedMapping({
      headers,
      columns: PRODUCT_IMPORT_COLUMNS,
      autoMapping,
      savedMapping: saved,
    });

    expect(result.usedSavedMapping).toBe(true);
    expect(result.versionMismatch).toBe(false);
    expect(result.appliedMappings.filter((m) => m.source === 'saved')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceHeader: 'Item Name', targetField: 'name' }),
        expect.objectContaining({ sourceHeader: 'SKU', targetField: 'code' }),
        expect.objectContaining({ sourceHeader: 'Sale Price', targetField: 'sellingPrice' }),
      ]),
    );
    // Unit was not in saved → auto fallback.
    expect(result.appliedMappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceHeader: 'Unit',
          targetField: 'unit',
          source: 'auto',
        }),
      ]),
    );
    expect(result.mapping.columnMappings).toEqual(
      expect.arrayContaining([
        { sourceHeader: 'Item Name', targetField: 'name' },
        { sourceHeader: 'SKU', targetField: 'code' },
        { sourceHeader: 'Sale Price', targetField: 'sellingPrice' },
        { sourceHeader: 'Unit', targetField: 'unit' },
      ]),
    );
    expect(result.confidence).toBeGreaterThan(0.4);
  });

  it('2. skips Saved Mapping entries whose headers are missing from the file', () => {
    const headers = ['Invoice No', 'Invoice Date', 'Amount'];
    const autoMapping = buildAutoMapping(headers, SALE_IMPORT_COLUMNS, {
      profile: SALES_SUMMARY_REPORT,
    });

    const saved = savedDoc({
      entity: 'sale',
      reportType: 'sales-summary',
      mappings: [
        { sourceHeader: 'Invoice No', targetField: 'saleNumber' },
        { sourceHeader: 'Invoice Date', targetField: 'saleDate' },
        { sourceHeader: 'Contact Name', targetField: 'customerName' }, // missing in file
        { sourceHeader: 'Amount', targetField: 'sellingPrice' },
      ],
    });

    const result = applySavedMapping({
      headers,
      columns: SALE_IMPORT_COLUMNS,
      autoMapping,
      savedMapping: saved,
    });

    expect(result.skippedMappings).toEqual([
      {
        sourceHeader: 'Contact Name',
        targetField: 'customerName',
        reason: 'missing_header',
      },
    ]);
    expect(result.appliedMappings.some((m) => m.targetField === 'customerName')).toBe(false);
    expect(result.appliedMappings.filter((m) => m.source === 'saved')).toHaveLength(3);
  });

  it('3. new columns fall back to Auto Mapping', () => {
    const headers = ['Date', 'Item Name', 'Qty', 'Rate', 'Invoice No', 'Party Name'];
    const autoMapping = buildAutoMapping(headers, SALE_IMPORT_COLUMNS, {
      profile: SALES_DETAIL_REPORT,
    });

    // Saved only remembers a subset; Party Name is new.
    const saved = savedDoc({
      entity: 'sale',
      reportType: 'sales-detail',
      mappings: [
        { sourceHeader: 'Date', targetField: 'saleDate' },
        { sourceHeader: 'Item Name', targetField: 'productName' },
        { sourceHeader: 'Qty', targetField: 'quantity' },
      ],
    });

    const result = applySavedMapping({
      headers,
      columns: SALE_IMPORT_COLUMNS,
      autoMapping,
      savedMapping: saved,
    });

    expect(result.appliedMappings.filter((m) => m.source === 'saved')).toHaveLength(3);
    expect(result.appliedMappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceHeader: 'Rate',
          targetField: 'sellingPrice',
          source: 'auto',
        }),
        expect.objectContaining({
          sourceHeader: 'Invoice No',
          targetField: 'saleNumber',
          source: 'auto',
        }),
        expect.objectContaining({
          sourceHeader: 'Party Name',
          targetField: 'customerName',
          source: 'auto',
        }),
      ]),
    );
  });

  it('4. old mappings remain valid after additional columns are added', () => {
    const previousHeaders = ['Product Name', 'Selling Price'];
    const expandedHeaders = ['Product Name', 'Selling Price', 'Product Code', 'Category', 'Unit'];

    const saved = savedDoc({
      entity: 'product',
      reportType: 'product-import',
      mappings: [
        { sourceHeader: 'Product Name', targetField: 'name' },
        { sourceHeader: 'Selling Price', targetField: 'sellingPrice' },
      ],
    });

    const autoMapping = buildAutoMapping(expandedHeaders, PRODUCT_IMPORT_COLUMNS, {
      profile: PRODUCT_IMPORT_REPORT,
    });

    const result = applySavedMapping({
      headers: expandedHeaders,
      columns: PRODUCT_IMPORT_COLUMNS,
      autoMapping,
      savedMapping: saved,
    });

    // Original saved pairs still applied.
    expect(result.appliedMappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceHeader: 'Product Name',
          targetField: 'name',
          source: 'saved',
        }),
        expect.objectContaining({
          sourceHeader: 'Selling Price',
          targetField: 'sellingPrice',
          source: 'saved',
        }),
      ]),
    );
    // New columns filled by auto.
    expect(result.appliedMappings.filter((m) => m.source === 'auto').length).toBeGreaterThanOrEqual(
      2,
    );
    expect(result.skippedMappings).toEqual([]);
    expect(previousHeaders.every((h) => result.appliedMappings.some((m) => m.sourceHeader === h))).toBe(
      true,
    );
  });

  it('5. version mismatch is handled gracefully (valid pairs still apply)', () => {
    const headers = ['Product Name', 'Selling Price', 'Unit'];
    const autoMapping = buildAutoMapping(headers, PRODUCT_IMPORT_COLUMNS, {
      profile: PRODUCT_IMPORT_REPORT,
    });

    const saved = savedDoc({
      entity: 'product',
      reportType: 'product-import',
      version: SAVED_MAPPING_SCHEMA_VERSION + 5,
      mappings: [
        { sourceHeader: 'Product Name', targetField: 'name' },
        { sourceHeader: 'Selling Price', targetField: 'sellingPrice' },
        { sourceHeader: 'Legacy Field', targetField: 'name' }, // missing header
      ],
    });

    const withMismatch = applySavedMapping({
      headers,
      columns: PRODUCT_IMPORT_COLUMNS,
      autoMapping,
      savedMapping: saved,
    });

    const currentVersionResult = applySavedMapping({
      headers,
      columns: PRODUCT_IMPORT_COLUMNS,
      autoMapping,
      savedMapping: { ...saved, version: SAVED_MAPPING_SCHEMA_VERSION },
    });

    expect(withMismatch.versionMismatch).toBe(true);
    expect(withMismatch.outdatedMappings.some((m) => m.reason === 'version_mismatch')).toBe(true);
    expect(withMismatch.appliedMappings.filter((m) => m.source === 'saved')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceHeader: 'Product Name', targetField: 'name' }),
        expect.objectContaining({ sourceHeader: 'Selling Price', targetField: 'sellingPrice' }),
      ]),
    );
    expect(withMismatch.skippedMappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceHeader: 'Legacy Field', reason: 'missing_header' }),
      ]),
    );
    expect(withMismatch.confidence).toBeLessThan(currentVersionResult.confidence);
  });

  it('6. no Saved Mapping → Auto Mapping only', () => {
    const headers = ['Product Name', 'Product Code', 'Selling Price'];
    const autoMapping = buildAutoMapping(headers, PRODUCT_IMPORT_COLUMNS, {
      profile: PRODUCT_IMPORT_REPORT,
    });

    const result = applySavedMapping({
      headers,
      columns: PRODUCT_IMPORT_COLUMNS,
      autoMapping,
      savedMapping: null,
    });

    expect(result.usedSavedMapping).toBe(false);
    expect(result.savedMappingVersion).toBeNull();
    expect(result.skippedMappings).toEqual([]);
    expect(result.outdatedMappings).toEqual([]);
    expect(result.appliedMappings.every((m) => m.source === 'auto')).toBe(true);
    expect(result.mapping).toEqual(autoMapping.mapping);
    expect(result.confidence).toBe(autoMapping.mappingConfidence);
  });

  it('marks unknown target fields as outdated', () => {
    const headers = ['Product Name', 'Weird'];
    const autoMapping = buildAutoMapping(headers, PRODUCT_IMPORT_COLUMNS, {
      profile: PRODUCT_IMPORT_REPORT,
    });

    const saved = savedDoc({
      entity: 'product',
      reportType: 'product-import',
      mappings: [
        { sourceHeader: 'Product Name', targetField: 'name' },
        { sourceHeader: 'Weird', targetField: 'removedField' },
      ],
    });

    const result = applySavedMapping({
      headers,
      columns: PRODUCT_IMPORT_COLUMNS,
      autoMapping,
      savedMapping: saved,
    });

    expect(result.outdatedMappings).toEqual([
      {
        sourceHeader: 'Weird',
        targetField: 'removedField',
        reason: 'unknown_target_field',
      },
    ]);
    expect(result.newMappingsNeeded).toContain('Weird');
  });

  it('matches saved headers with normalized punctuation (Invoice No. vs Invoice No)', () => {
    const headers = ['Invoice No.', 'Date', 'Amount'];
    const autoMapping = buildAutoMapping(headers, SALE_IMPORT_COLUMNS, {
      profile: SALES_SUMMARY_REPORT,
    });

    const saved = savedDoc({
      entity: 'sale',
      reportType: 'sales-summary',
      mappings: [
        { sourceHeader: 'Invoice No', targetField: 'saleNumber' },
        { sourceHeader: 'Date', targetField: 'saleDate' },
        { sourceHeader: 'Amount', targetField: 'sellingPrice' },
      ],
    });

    const result = applySavedMapping({
      headers,
      columns: SALE_IMPORT_COLUMNS,
      autoMapping,
      savedMapping: saved,
    });

    expect(result.appliedMappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceHeader: 'Invoice No.',
          targetField: 'saleNumber',
          source: 'saved',
        }),
      ]),
    );
    expect(result.skippedMappings).toEqual([]);
  });
});

describe('buildSavedMappingDocument / savedMappingDocId', () => {
  it('builds a persistence-ready document with metadata', () => {
    const doc = buildSavedMappingDocument({
      organizationId: 'org-1',
      entity: 'product',
      reportType: 'product-import',
      mappings: [{ sourceHeader: 'Item Name', targetField: 'name' }],
      approvedFrom: 'manual',
      now: new Date('2026-07-24T00:00:00.000Z'),
    });

    expect(doc.version).toBe(SAVED_MAPPING_SCHEMA_VERSION);
    expect(doc.mappings[0]).toEqual({
      sourceHeader: 'Item Name',
      targetField: 'name',
      metadata: {
        approvedFrom: 'manual',
        normalizedSourceHeader: 'item name',
      },
    });
    expect(savedMappingDocId('sale', 'sales-summary')).toBe('sale__sales-summary');
  });

  it('preserves createdAt when updating an existing document', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const existing = savedDoc({
      entity: 'product',
      reportType: 'product-import',
      mappings: [],
      createdAt,
    });

    const updated = buildSavedMappingDocument({
      organizationId: 'org-1',
      entity: 'product',
      reportType: 'product-import',
      mappings: [{ sourceHeader: 'Name', targetField: 'name' }],
      existing,
      now: new Date('2026-07-24T00:00:00.000Z'),
    });

    expect(updated.createdAt).toEqual(createdAt);
    expect(updated.lastUsedAt.toISOString()).toBe('2026-07-24T00:00:00.000Z');
  });
});
