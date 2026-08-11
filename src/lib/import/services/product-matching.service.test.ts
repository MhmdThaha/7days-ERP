/**
 * Product Matching Engine tests — classification only, no import execution.
 */

import { describe, expect, it } from 'vitest';

import {
  buildProductMatchCatalog,
  matchProduct,
  normalizeProductMatchCode,
  normalizeProductMatchName,
  PRODUCT_MATCH_CONFIDENCE,
  PRODUCT_MATCH_STATUS,
  scoreProductNameSimilarity,
  type ProductMatchCatalogEntry,
} from '@/lib/import/services/product-matching.service';

function entry(
  partial: Pick<ProductMatchCatalogEntry, 'id' | 'name' | 'code'> &
    Partial<ProductMatchCatalogEntry>,
): ProductMatchCatalogEntry {
  return {
    unit: 'pcs',
    isActive: true,
    deletedAt: null,
    ...partial,
  };
}

const largeMilkBread = entry({
  id: 'prod-large-milk',
  name: 'Large Milk Bread',
  code: 'LMB-001',
  unit: 'PACK',
});

const smallBread = entry({
  id: 'prod-small',
  name: 'Small Bread',
  code: 'SB-002',
});

const bigBread = entry({
  id: 'prod-big',
  name: 'Big Bread',
  code: 'BB-003',
});

const plainBread = entry({
  id: 'prod-plain',
  name: 'Bread',
  code: 'BRD-000',
});

const inactiveBread = entry({
  id: 'prod-inactive',
  name: 'Garlic Bread',
  code: 'GB-010',
  isActive: false,
});

const deletedBread = entry({
  id: 'prod-deleted',
  name: 'Stale Bread',
  code: 'ST-999',
  deletedAt: '2026-01-01',
});

function catalog(...products: ProductMatchCatalogEntry[]) {
  return buildProductMatchCatalog(products);
}

describe('normalizeProductMatchName', () => {
  it('is case insensitive', () => {
    expect(normalizeProductMatchName('bread')).toBe(normalizeProductMatchName('BREAD'));
    expect(normalizeProductMatchName('Bread')).toBe('bread');
  });

  it('trims leading and trailing spaces', () => {
    expect(normalizeProductMatchName(' Bread ')).toBe('bread');
    expect(normalizeProductMatchName('Bread   ')).toBe('bread');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeProductMatchName('Large  Milk  Bread')).toBe('large milk bread');
  });

  it('normalizes unicode trademark and registered marks', () => {
    expect(normalizeProductMatchName('Bread\u2122')).toBe('bread');
    expect(normalizeProductMatchName('Bread\u00ae')).toBe('bread');
  });
});

describe('normalizeProductMatchCode', () => {
  it('trims and uppercases barcodes', () => {
    expect(normalizeProductMatchCode(' brd-001 ')).toBe('BRD-001');
  });
});

describe('matchProduct — barcode / product code', () => {
  it('returns MATCHED immediately for a unique barcode', () => {
    const result = matchProduct(
      { productCode: 'LMB-001', productName: 'Anything Else' },
      catalog(largeMilkBread),
    );

    expect(result.status).toBe(PRODUCT_MATCH_STATUS.MATCHED);
    expect(result.matchedProductId).toBe('prod-large-milk');
    expect(result.matchedProductName).toBe('Large Milk Bread');
    expect(result.confidence).toBe(PRODUCT_MATCH_CONFIDENCE.BARCODE);
    expect(result.reason).toBe('Barcode Match');
  });

  it('continues when barcode is missing and matches by name', () => {
    const result = matchProduct({ productName: 'Large Milk Bread' }, catalog(largeMilkBread));

    expect(result.status).toBe(PRODUCT_MATCH_STATUS.MATCHED);
    expect(result.confidence).toBe(PRODUCT_MATCH_CONFIDENCE.EXACT_NAME);
  });

  it('returns SYSTEM_CONFIGURATION_ERROR for duplicate barcodes in BakeryOS', () => {
    const duplicateCode = entry({ id: 'prod-a', name: 'Product A', code: 'DUP-001' });
    const duplicateTwin = entry({ id: 'prod-b', name: 'Product B', code: 'dup-001' });

    const result = matchProduct(
      { productCode: 'DUP-001', productName: 'Product A' },
      catalog(duplicateCode, duplicateTwin),
    );

    expect(result.status).toBe(PRODUCT_MATCH_STATUS.SYSTEM_CONFIGURATION_ERROR);
    expect(result.reason).toMatch(/duplicate barcode/i);
  });

  it('returns MULTIPLE_MATCHES when barcode and product name refer to different products', () => {
    const bigBreadWithCode = entry({
      id: 'prod-big',
      name: 'Big Bread',
      code: 'PRD-001',
    });
    const smallBreadWithCode = entry({
      id: 'prod-small',
      name: 'Small Bread',
      code: 'PRD-002',
    });

    const result = matchProduct(
      { productCode: 'PRD-001', productName: 'Small Bread' },
      catalog(bigBreadWithCode, smallBreadWithCode),
    );

    expect(result.status).toBe(PRODUCT_MATCH_STATUS.MULTIPLE_MATCHES);
    expect(result.matchedProductId).toBeNull();
    expect(result.reason).toMatch(/name and product code refer to different products/i);
    expect(result.candidates?.map((candidate) => candidate.productName).sort()).toEqual([
      'Big Bread',
      'Small Bread',
    ]);
  });

  it('still matches by barcode when the name does not point to another product', () => {
    const result = matchProduct(
      { productCode: 'LMB-001', productName: 'Large Milk Bread Extra' },
      catalog(largeMilkBread, smallBread),
    );

    expect(result.status).toBe(PRODUCT_MATCH_STATUS.MATCHED);
    expect(result.matchedProductId).toBe('prod-large-milk');
    expect(result.reason).toBe('Barcode Match');
  });
});

describe('matchProduct — saved mapping', () => {
  it('reuses a previously saved import-name mapping', () => {
    const savedMappings = new Map([
      [normalizeProductMatchName('Large Bread'), 'prod-large-milk'],
    ]);

    const result = matchProduct(
      { productName: 'Large Bread' },
      catalog(largeMilkBread),
      { savedMappings },
    );

    expect(result.status).toBe(PRODUCT_MATCH_STATUS.MATCHED);
    expect(result.matchedProductId).toBe('prod-large-milk');
    expect(result.confidence).toBe(PRODUCT_MATCH_CONFIDENCE.SAVED_MAPPING);
    expect(result.reason).toBe('Saved Mapping');
  });
});

describe('matchProduct — exact name', () => {
  it('matches exact product names', () => {
    const result = matchProduct({ productName: 'Bread' }, catalog(plainBread));

    expect(result.status).toBe(PRODUCT_MATCH_STATUS.MATCHED);
    expect(result.confidence).toBe(PRODUCT_MATCH_CONFIDENCE.EXACT_NAME);
    expect(result.reason).toBe('Exact Name Match');
  });

  it('matches despite case and spacing differences', () => {
    const result = matchProduct(
      { productName: '  LARGE   milk   bread  ' },
      catalog(largeMilkBread),
    );

    expect(result.status).toBe(PRODUCT_MATCH_STATUS.MATCHED);
    expect(result.matchedProductId).toBe('prod-large-milk');
  });

  it('returns SYSTEM_CONFIGURATION_ERROR for duplicate active product names', () => {
    const twinA = entry({ id: 'prod-a', name: 'Twin Bread', code: 'TWIN-A' });
    const twinB = entry({ id: 'prod-b', name: 'twin bread', code: 'TWIN-B' });

    const result = matchProduct({ productName: 'Twin Bread' }, catalog(twinA, twinB));

    expect(result.status).toBe(PRODUCT_MATCH_STATUS.SYSTEM_CONFIGURATION_ERROR);
    expect(result.reason).toMatch(/same name/i);
  });
});

describe('matchProduct — fuzzy name', () => {
  it('returns NEEDS_CONFIRMATION for very similar names', () => {
    const result = matchProduct({ productName: 'Large Bread' }, catalog(largeMilkBread));

    expect(result.status).toBe(PRODUCT_MATCH_STATUS.NEEDS_CONFIRMATION);
    expect(result.matchedProductId).toBe('prod-large-milk');
    expect(result.confidence).toBeGreaterThanOrEqual(PRODUCT_MATCH_CONFIDENCE.FUZZY_MIN);
    expect(result.confidence).toBeLessThanOrEqual(PRODUCT_MATCH_CONFIDENCE.FUZZY_MAX);
    expect(result.reason).toBe('Fuzzy Name Match');
  });

  it('never auto-matches fuzzy names', () => {
    const result = matchProduct({ productName: 'Large Bread' }, catalog(largeMilkBread));

    expect(result.status).not.toBe(PRODUCT_MATCH_STATUS.MATCHED);
  });
});

describe('matchProduct — generic and ambiguous names', () => {
  it('returns MULTIPLE_MATCHES for a generic name that fits several products', () => {
    const result = matchProduct({ productName: 'Bread' }, catalog(bigBread, smallBread));

    expect(result.status).toBe(PRODUCT_MATCH_STATUS.MULTIPLE_MATCHES);
    expect(result.matchedProductId).toBeNull();
    expect(result.candidates?.length).toBeGreaterThanOrEqual(2);
  });

  it('returns MULTIPLE_MATCHES when top fuzzy scores are too close to auto-select', () => {
    const candidateA = entry({ id: 'prod-a', name: 'Big Bread Loaf', code: 'A-001' });
    const candidateB = entry({ id: 'prod-b', name: 'Small Bread Loaf', code: 'B-001' });
    const scoreA = scoreProductNameSimilarity('Bread Loaf', candidateA.name);
    const scoreB = scoreProductNameSimilarity('Bread Loaf', candidateB.name);

    expect(Math.abs(scoreA - scoreB)).toBeLessThanOrEqual(5);

    const result = matchProduct({ productName: 'Bread Loaf' }, catalog(candidateA, candidateB));

    expect(result.status).toBe(PRODUCT_MATCH_STATUS.MULTIPLE_MATCHES);
    expect(result.matchedProductId).toBeNull();
    expect(result.candidates?.length).toBeGreaterThanOrEqual(2);
  });

  it('returns NEEDS_CONFIRMATION for a strong unique fuzzy match', () => {
    const result = matchProduct({ productName: 'Big Bread 400g' }, catalog(bigBread, smallBread));

    expect(result.status).toBe(PRODUCT_MATCH_STATUS.NEEDS_CONFIRMATION);
    expect(result.matchedProductId).toBe('prod-big');
    expect(result.reason).toBe('Fuzzy Name Match');
  });
});

describe('matchProduct — real-world bakery catalog safety', () => {
  const wheatBread = entry({
    id: 'prod-wheat',
    name: 'Wheat Bread',
    code: 'WB-001',
  });

  const bakeryCatalog = catalog(bigBread, smallBread, wheatBread);

  it('flags generic Bread as ambiguous across Big Bread, Small Bread, and Wheat Bread', () => {
    const result = matchProduct({ productName: 'Bread' }, bakeryCatalog);

    expect(result.status).toBe(PRODUCT_MATCH_STATUS.MULTIPLE_MATCHES);
    expect(result.candidates?.map((candidate) => candidate.productName).sort()).toEqual([
      'Big Bread',
      'Small Bread',
      'Wheat Bread',
    ]);
  });

  it('auto-matches exact Big Bread', () => {
    const result = matchProduct({ productName: 'Big Bread' }, bakeryCatalog);

    expect(result.status).toBe(PRODUCT_MATCH_STATUS.MATCHED);
    expect(result.matchedProductId).toBe('prod-big');
  });

  it('does not invent a match for Small Milk Bread', () => {
    const result = matchProduct({ productName: 'Small Milk Bread' }, bakeryCatalog);

    expect([PRODUCT_MATCH_STATUS.NOT_FOUND, PRODUCT_MATCH_STATUS.NEEDS_CONFIRMATION]).toContain(
      result.status,
    );

    if (result.status === PRODUCT_MATCH_STATUS.NEEDS_CONFIRMATION) {
      expect(result.matchedProductId).not.toBe('prod-big');
      expect(result.matchedProductId).not.toBe('prod-wheat');
    }
  });
});

describe('matchProduct — inactive and deleted products', () => {
  it('returns NEEDS_CONFIRMATION for inactive exact-name matches', () => {
    const result = matchProduct({ productName: 'Garlic Bread' }, catalog(inactiveBread));

    expect(result.status).toBe(PRODUCT_MATCH_STATUS.NEEDS_CONFIRMATION);
    expect(result.reason).toBe('Inactive Product');
    expect(result.confidence).toBe(PRODUCT_MATCH_CONFIDENCE.EXACT_NAME);
  });

  it('ignores deleted products', () => {
    const result = matchProduct({ productName: 'Stale Bread' }, catalog(deletedBread));

    expect(result.status).toBe(PRODUCT_MATCH_STATUS.NOT_FOUND);
  });

  it('does not barcode-match deleted products when another live product shares the name path', () => {
    const live = entry({ id: 'prod-live', name: 'Fresh Bread', code: 'FR-001' });

    const result = matchProduct(
      { productCode: 'ST-999', productName: 'Fresh Bread' },
      catalog(deletedBread, live),
    );

    expect(result.status).toBe(PRODUCT_MATCH_STATUS.MATCHED);
    expect(result.matchedProductId).toBe('prod-live');
    expect(result.reason).toBe('Exact Name Match');
  });
});

describe('matchProduct — missing and unknown inputs', () => {
  it('returns NOT_FOUND for empty product name and barcode', () => {
    const result = matchProduct({ productName: '   ', productCode: '' }, catalog(plainBread));

    expect(result.status).toBe(PRODUCT_MATCH_STATUS.NOT_FOUND);
    expect(result.confidence).toBe(0);
  });

  it('returns NOT_FOUND for unknown products', () => {
    const result = matchProduct({ productName: 'Moon Cheese' }, catalog(plainBread));

    expect(result.status).toBe(PRODUCT_MATCH_STATUS.NOT_FOUND);
  });

  it('returns NOT_FOUND when barcode is absent and name does not match', () => {
    const result = matchProduct({ productName: 'Unknown Loaf' }, catalog(plainBread));

    expect(result.status).toBe(PRODUCT_MATCH_STATUS.NOT_FOUND);
  });
});

describe('matchProduct — unit mismatch metadata', () => {
  it('returns MATCHED with a unit mismatch warning instead of rejecting', () => {
    const result = matchProduct(
      { productCode: 'LMB-001', productName: 'Large Milk Bread', unit: 'PCS' },
      catalog(largeMilkBread),
    );

    expect(result.status).toBe(PRODUCT_MATCH_STATUS.MATCHED);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'UNIT_MISMATCH',
        importUnit: 'PCS',
        catalogUnit: 'PACK',
      }),
    ]);
  });
});

describe('scoreProductNameSimilarity', () => {
  it('scores exact normalized names at 100', () => {
    expect(scoreProductNameSimilarity('Large Milk Bread', 'large milk bread')).toBe(100);
  });

  it('scores similar names in the fuzzy band', () => {
    const score = scoreProductNameSimilarity('Large Bread', 'Large Milk Bread');

    expect(score).toBeGreaterThanOrEqual(PRODUCT_MATCH_CONFIDENCE.FUZZY_MIN);
    expect(score).toBeLessThanOrEqual(PRODUCT_MATCH_CONFIDENCE.FUZZY_MAX);
  });
});

describe('buildProductMatchCatalog', () => {
  it('flags duplicate codes and duplicate exact names among live products', () => {
    const index = catalog(
      entry({ id: 'a', name: 'Same Name', code: 'CODE-A' }),
      entry({ id: 'b', name: 'same name', code: 'CODE-B' }),
      entry({ id: 'c', name: 'Other', code: 'DUP' }),
      entry({ id: 'd', name: 'Another', code: 'dup' }),
    );

    expect(index.duplicateExactNames.has(normalizeProductMatchName('Same Name'))).toBe(true);
    expect(index.duplicateCodes.has(normalizeProductMatchCode('DUP'))).toBe(true);
    expect(index.products).toHaveLength(4);
  });

  it('excludes deleted products from the live catalog', () => {
    const index = catalog(deletedBread, plainBread);

    expect(index.products).toHaveLength(1);
    expect(index.products[0]?.id).toBe('prod-plain');
  });
});
