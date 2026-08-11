import { describe, expect, it } from 'vitest';

import {
  buildExpandedAliasSet,
  REPORT_HEADER_SIMILARITY_THRESHOLD,
  scoreHeaderSimilarity,
} from '@/lib/import/reports/report-field-aliases';
import { normalizeHeaderLabel } from '@/lib/import/services/header-detection.service';

describe('buildExpandedAliasSet', () => {
  it('includes universal quantity aliases for quantity requirements', () => {
    const aliases = buildExpandedAliasSet({
      key: 'quantity',
      label: 'Quantity',
      aliases: ['Qty'],
    });

    expect(aliases.has(normalizeHeaderLabel('Sales Qty.'))).toBe(true);
    expect(aliases.has(normalizeHeaderLabel('Qty Sold'))).toBe(true);
  });

  it('includes universal amount aliases for amount requirements', () => {
    const aliases = buildExpandedAliasSet({
      key: 'amount',
      label: 'Amount',
      aliases: ['Amount'],
    });

    expect(aliases.has(normalizeHeaderLabel('Net Amount'))).toBe(true);
    expect(aliases.has(normalizeHeaderLabel('Sale Value'))).toBe(true);
  });
});

describe('scoreHeaderSimilarity', () => {
  it('scores exact normalized matches at 1', () => {
    expect(scoreHeaderSimilarity('invoice date', 'invoice date')).toBe(1);
  });

  it('scores token-subset matches above the detection threshold', () => {
    expect(scoreHeaderSimilarity('total amount', 'amount')).toBeGreaterThanOrEqual(
      REPORT_HEADER_SIMILARITY_THRESHOLD,
    );
  });

  it('does not score catalog Unit as similar to quantity alias Unit Qty', () => {
    expect(scoreHeaderSimilarity('unit', 'unit qty')).toBeLessThan(
      REPORT_HEADER_SIMILARITY_THRESHOLD,
    );
  });
});
