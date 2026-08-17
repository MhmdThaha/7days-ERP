/**
 * Duplicate Import Protection tests — stateless analysis against import history.
 */

import { describe, expect, it } from 'vitest';

import {
  buildDuplicateImportFileFingerprint,
  buildDuplicateImportFingerprints,
  buildDuplicateImportRowFingerprint,
  detectDuplicateImport,
} from '@/lib/import/duplicate/duplicate-import.service';
import {
  DUPLICATE_IMPORT_RECOMMENDATION,
  DUPLICATE_IMPORT_STATUS,
  IMPORT_HISTORY_STATUS,
  shouldResumeBlockedDuplicateImport,
  type ImportHistoryRecord,
} from '@/lib/import/duplicate';
import type { ImportReviewViewModelWithResolution, ResolvedImportReviewRow } from '@/lib/import/resolution/types';
import { SALES_DETAIL_REPORT } from '@/lib/import/reports/definitions';
import {
  AUTO_IMPORT_RECOMMENDATION,
  CONFIDENCE_LEVEL,
} from '@/lib/import/services/confidence-engine.service';
import { CONFLICT_ENGINE_STATUS } from '@/lib/import/services/conflict-engine.service';
import { PRODUCT_MATCH_STATUS } from '@/lib/import/services/product-matching.service';

function baseRow(
  rowNumber: number,
  values: Record<string, unknown>,
  overrides: Partial<ResolvedImportReviewRow> = {},
): ResolvedImportReviewRow {
  return {
    rowNumber,
    originalValues: values,
    normalizedValues: values as ResolvedImportReviewRow['normalizedValues'],
    reportDetectionResult: {
      profile: SALES_DETAIL_REPORT,
      reportType: 'sales-detail',
      confidence: 0.9,
      matchedColumns: [],
      missingColumns: [],
      matchedHeaders: [],
      missingHeaders: [],
      unmatchedHeaders: [],
      explanation: [],
      candidates: [],
    },
    productMatchResult: {
      status: PRODUCT_MATCH_STATUS.MATCHED,
      matchedProductId: 'prod-bread',
      matchedProductName: 'Bread',
      confidence: 98,
      reason: 'Exact Name Match',
    },
    conflictEngineResult: {
      status: CONFLICT_ENGINE_STATUS.READY,
      conflicts: [],
      warnings: [],
      blockingReason: null,
      recommendedAction: null,
      confidencePenalty: 0,
    },
    confidenceResult: {
      confidenceScore: 90,
      confidenceLevel: CONFIDENCE_LEVEL.HIGH,
      confidenceReasons: [],
      autoImportRecommendation: AUTO_IMPORT_RECOMMENDATION.PREVIEW_FIRST,
    },
    ...overrides,
  };
}

function reviewWithRows(rows: ResolvedImportReviewRow[]): ImportReviewViewModelWithResolution {
  return {
    overview: {
      fileName: 'sales.csv',
      detectedReportName: 'Sales Detail',
      detectedReportType: 'sales-detail',
      reportConfidence: 0.9,
      headerRowIndex: 0,
      totalRows: rows.length,
      readyRows: rows.length,
      warningRows: 0,
      errorRows: 0,
      averageConfidence: 90,
      autoImportEligibleRows: 0,
      blockedRows: 0,
    },
    reportSummary: {
      matchedColumns: [],
      missingRequiredColumns: [],
      extraColumns: [],
      unknownHeaders: [],
      detectionReasons: [],
    },
    rows,
  };
}

function historyRecord(
  overrides: Partial<ImportHistoryRecord> & Pick<ImportHistoryRecord, 'importId'>,
): ImportHistoryRecord {
  return {
    importedAt: '2026-03-01T10:00:00.000Z',
    importedBy: 'owner@bakery.test',
    reportType: 'sales-detail',
    rowCount: 1,
    fileFingerprint: '',
    invoiceNumbers: [],
    rowFingerprints: [],
    status: IMPORT_HISTORY_STATUS.IMPORTED,
    ...overrides,
  };
}

describe('buildDuplicateImportRowFingerprint', () => {
  it('normalizes whitespace, case, and date formats consistently', () => {
    const rowA = baseRow(2, {
      saleDate: '2026-03-01',
      customerName: ' Safeer Bai ',
      productName: 'Bread',
      quantity: 20,
      amount: 700,
      saleNumber: ' inv-100 ',
    });

    const rowB = baseRow(3, {
      saleDate: '01/03/2026',
      customerName: 'safeer bai',
      productName: 'BREAD',
      quantity: '20',
      amount: '700',
      saleNumber: 'INV-100',
    });

    expect(buildDuplicateImportRowFingerprint(rowA)).toBe(
      buildDuplicateImportRowFingerprint(rowB),
    );
  });
});

describe('buildDuplicateImportFileFingerprint', () => {
  it('is stable across row order and ignores filename differences', () => {
    const rowsA = [
      baseRow(2, {
        saleDate: '2026-03-01',
        customerName: 'Store A',
        productName: 'Bread',
        quantity: 2,
        saleNumber: 'INV-1',
      }),
      baseRow(3, {
        saleDate: '2026-03-02',
        customerName: 'Store B',
        productName: 'Puff',
        quantity: 1,
        saleNumber: 'INV-2',
      }),
    ];

    const rowsB = [rowsA[1]!, rowsA[0]!];

    const fpA = buildDuplicateImportFingerprints(rowsA).fileFingerprint;
    const fpB = buildDuplicateImportFingerprints(rowsB).fileFingerprint;

    expect(fpA).toBe(fpB);
    expect(fpA).not.toBe('');
  });
});

describe('detectDuplicateImport', () => {
  it('returns NO_DUPLICATE when there is no import history', () => {
    const review = reviewWithRows([
      baseRow(2, {
        saleDate: '2026-03-01',
        customerName: 'Corner Store',
        productName: 'Bread',
        quantity: 2,
        saleNumber: 'INV-1',
      }),
    ]);

    const result = detectDuplicateImport({ resolvedReview: review, importHistory: [] });

    expect(result.status).toBe(DUPLICATE_IMPORT_STATUS.NO_DUPLICATE);
    expect(result.recommendation).toBe(DUPLICATE_IMPORT_RECOMMENDATION.CONTINUE);
  });

  it('detects EXACT_DUPLICATE for the same completed file fingerprint', () => {
    const rows = [
      baseRow(2, {
        saleDate: '2026-03-01',
        customerName: 'Metro',
        productName: 'Bread',
        quantity: 2,
        saleNumber: 'INV-10',
      }),
    ];
    const fingerprints = buildDuplicateImportFingerprints(rows);

    const review = reviewWithRows(rows);
    const result = detectDuplicateImport({
      resolvedReview: review,
      importHistory: [
        historyRecord({
          importId: 'imp-1',
          fileFingerprint: fingerprints.fileFingerprint,
          rowFingerprints: fingerprints.rowFingerprints,
          invoiceNumbers: fingerprints.invoiceNumbers,
          rowCount: 1,
        }),
      ],
    });

    expect(result.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
    expect(result.confidence).toBe(100);
    expect(result.recommendation).toBe(DUPLICATE_IMPORT_RECOMMENDATION.BLOCK_IMPORT);
    expect(result.matchedImport?.importId).toBe('imp-1');
  });

  it('treats renamed files with identical business data as exact duplicates', () => {
    const rows = [
      baseRow(2, {
        saleDate: '2026-03-01',
        customerName: 'Metro',
        productName: 'Bread',
        quantity: 2,
        saleNumber: 'INV-10',
      }),
    ];
    const fingerprints = buildDuplicateImportFingerprints(rows);

    const result = detectDuplicateImport({
      resolvedReview: reviewWithRows(rows),
      importHistory: [
        historyRecord({
          importId: 'imp-old-name',
          fileFingerprint: fingerprints.fileFingerprint,
          rowFingerprints: fingerprints.rowFingerprints,
          invoiceNumbers: ['INV-10'],
          rowCount: 1,
        }),
      ],
    });

    expect(result.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
  });

  it('detects HIGH_CONFIDENCE_DUPLICATE when nearly all invoices match', () => {
    const rows = [
      baseRow(2, {
        saleDate: '2026-03-01',
        customerName: 'A',
        productName: 'Bread',
        quantity: 1,
        saleNumber: 'INV-1',
      }),
      baseRow(3, {
        saleDate: '2026-03-01',
        customerName: 'B',
        productName: 'Puff',
        quantity: 1,
        saleNumber: 'INV-2',
      }),
    ];

    const result = detectDuplicateImport({
      resolvedReview: reviewWithRows(rows),
      importHistory: [
        historyRecord({
          importId: 'imp-invoices',
          fileFingerprint: 'different-file',
          rowFingerprints: ['other-row'],
          invoiceNumbers: ['INV-1', 'INV-2'],
          rowCount: 2,
        }),
      ],
    });

    expect(result.status).toBe(DUPLICATE_IMPORT_STATUS.HIGH_CONFIDENCE_DUPLICATE);
    expect(result.confidence).toBe(95);
    expect(result.matchedInvoices).toEqual(['INV-1', 'INV-2']);
    expect(result.recommendation).toBe(DUPLICATE_IMPORT_RECOMMENDATION.BLOCK_IMPORT);
  });

  it('detects HIGH_CONFIDENCE_DUPLICATE when most rows already imported', () => {
    const sharedRows = Array.from({ length: 10 }, (_, index) =>
      baseRow(index + 2, {
        saleDate: '2026-03-01',
        customerName: `Store ${index}`,
        productName: 'Bread',
        quantity: 2,
        saleNumber: `INV-${index}`,
      }),
    );

    const historyFingerprints = buildDuplicateImportFingerprints(sharedRows.slice(0, 9));

    const result = detectDuplicateImport({
      resolvedReview: reviewWithRows(sharedRows),
      importHistory: [
        historyRecord({
          importId: 'imp-rows',
          fileFingerprint: 'other-file',
          rowFingerprints: historyFingerprints.rowFingerprints,
          invoiceNumbers: [],
          rowCount: 9,
        }),
      ],
    });

    expect(result.status).toBe(DUPLICATE_IMPORT_STATUS.HIGH_CONFIDENCE_DUPLICATE);
    expect(result.confidence).toBe(90);
    expect(result.matchedRows).toBe(9);
    expect(result.duplicateRowFingerprints).toHaveLength(9);
    expect(result.recommendation).toBe(DUPLICATE_IMPORT_RECOMMENDATION.SKIP_DUPLICATES);
  });

  it('returns POSSIBLE_DUPLICATE for partial overlap with few matching rows', () => {
    const row = baseRow(2, {
      saleDate: '2026-03-01',
      customerName: 'Metro',
      productName: 'Bread',
      quantity: 2,
      saleNumber: 'INV-10',
    });
    const rowFp = buildDuplicateImportRowFingerprint(row);

    const review = reviewWithRows([
      row,
      baseRow(3, {
        saleDate: '2026-03-02',
        customerName: 'New Store',
        productName: 'Cake',
        quantity: 5,
        saleNumber: 'INV-99',
      }),
      baseRow(4, {
        saleDate: '2026-03-03',
        customerName: 'Another',
        productName: 'Tart',
        quantity: 3,
        saleNumber: 'INV-100',
      }),
    ]);

    const result = detectDuplicateImport({
      resolvedReview: review,
      importHistory: [
        historyRecord({
          importId: 'imp-partial',
          fileFingerprint: 'other',
          rowFingerprints: [rowFp, buildDuplicateImportRowFingerprint(review.rows[1]!)],
          invoiceNumbers: [],
          rowCount: 2,
        }),
      ],
    });

    expect(result.status).toBe(DUPLICATE_IMPORT_STATUS.POSSIBLE_DUPLICATE);
    expect(result.confidence).toBeGreaterThanOrEqual(40);
    expect(result.recommendation).toBe(DUPLICATE_IMPORT_RECOMMENDATION.REVIEW);
  });

  it('does not block routine daily purchases from the same customer', () => {
    const review = reviewWithRows([
      baseRow(2, {
        saleDate: '2026-03-05',
        customerName: 'Safeer Bai',
        productName: 'Bread',
        quantity: 20,
        amount: 700,
      }),
    ]);

    const priorDay = buildDuplicateImportRowFingerprint(
      baseRow(3, {
        saleDate: '2026-03-04',
        customerName: 'Safeer Bai',
        productName: 'Bread',
        quantity: 20,
        amount: 700,
      }),
    );

    const result = detectDuplicateImport({
      resolvedReview: review,
      importHistory: [
        historyRecord({
          importId: 'imp-daily',
          fileFingerprint: 'other-file',
          rowFingerprints: [priorDay],
          invoiceNumbers: [],
          rowCount: 1,
        }),
      ],
    });

    expect(result.status).toBe(DUPLICATE_IMPORT_STATUS.NO_DUPLICATE);
    expect(result.recommendation).toBe(DUPLICATE_IMPORT_RECOMMENDATION.CONTINUE);
  });

  it('does not block the same customer purchasing twice on one day with different lines', () => {
    const morning = buildDuplicateImportRowFingerprint(
      baseRow(2, {
        saleDate: '2026-03-01',
        customerName: 'Safeer Bai',
        productName: 'Bread',
        quantity: 10,
        amount: 350,
        saleNumber: 'INV-AM',
      }),
    );

    const review = reviewWithRows([
      baseRow(3, {
        saleDate: '2026-03-01',
        customerName: 'Safeer Bai',
        productName: 'Bread',
        quantity: 20,
        amount: 700,
        saleNumber: 'INV-PM',
      }),
    ]);

    const result = detectDuplicateImport({
      resolvedReview: review,
      importHistory: [
        historyRecord({
          importId: 'imp-twice',
          fileFingerprint: 'other',
          rowFingerprints: [morning],
          invoiceNumbers: ['INV-AM'],
          rowCount: 1,
        }),
      ],
    });

    expect(result.status).toBe(DUPLICATE_IMPORT_STATUS.NO_DUPLICATE);
  });

  it('ignores cancelled and rolled-back imports', () => {
    const rows = [
      baseRow(2, {
        saleDate: '2026-03-01',
        customerName: 'Metro',
        productName: 'Bread',
        quantity: 2,
        saleNumber: 'INV-10',
      }),
    ];
    const fingerprints = buildDuplicateImportFingerprints(rows);

    const review = reviewWithRows(rows);
    const history = [
      historyRecord({
        importId: 'imp-cancelled',
        status: IMPORT_HISTORY_STATUS.CANCELLED,
        fileFingerprint: fingerprints.fileFingerprint,
        rowFingerprints: fingerprints.rowFingerprints,
        invoiceNumbers: fingerprints.invoiceNumbers,
      }),
      historyRecord({
        importId: 'imp-rolled',
        status: IMPORT_HISTORY_STATUS.ROLLED_BACK,
        fileFingerprint: fingerprints.fileFingerprint,
        rowFingerprints: fingerprints.rowFingerprints,
        invoiceNumbers: fingerprints.invoiceNumbers,
      }),
    ];

    const result = detectDuplicateImport({ resolvedReview: review, importHistory: history });

    expect(result.status).toBe(DUPLICATE_IMPORT_STATUS.NO_DUPLICATE);
  });

  it('uses blocking imports for duplicate detection while ignoring cancelled history', () => {
    const rows = [
      baseRow(2, {
        saleDate: '2026-03-01',
        customerName: 'Metro',
        productName: 'Bread',
        quantity: 2,
        saleNumber: 'INV-10',
      }),
    ];
    const fingerprints = buildDuplicateImportFingerprints(rows);

    const result = detectDuplicateImport({
      resolvedReview: reviewWithRows(rows),
      importHistory: [
        historyRecord({
          importId: 'imp-cancelled',
          status: IMPORT_HISTORY_STATUS.CANCELLED,
          fileFingerprint: fingerprints.fileFingerprint,
          rowFingerprints: fingerprints.rowFingerprints,
          invoiceNumbers: fingerprints.invoiceNumbers,
        }),
        historyRecord({
          importId: 'imp-imported',
          status: IMPORT_HISTORY_STATUS.IMPORTED,
          fileFingerprint: fingerprints.fileFingerprint,
          rowFingerprints: fingerprints.rowFingerprints,
          invoiceNumbers: fingerprints.invoiceNumbers,
        }),
      ],
    });

    expect(result.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
    expect(result.matchedImport?.importId).toBe('imp-imported');
  });

  it('treats COMPLETED lifecycle imports as blocking duplicates', () => {
    const rows = [
      baseRow(2, {
        saleDate: '2026-03-01',
        customerName: 'Metro',
        productName: 'Bread',
        quantity: 2,
        saleNumber: 'INV-10',
      }),
    ];
    const fingerprints = buildDuplicateImportFingerprints(rows);

    const result = detectDuplicateImport({
      resolvedReview: reviewWithRows(rows),
      importHistory: [
        historyRecord({
          importId: 'imp-completed',
          status: IMPORT_HISTORY_STATUS.COMPLETED,
          fileFingerprint: fingerprints.fileFingerprint,
          rowFingerprints: fingerprints.rowFingerprints,
          invoiceNumbers: fingerprints.invoiceNumbers,
        }),
      ],
    });

    expect(result.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
    expect(result.matchedImport?.importId).toBe('imp-completed');
  });

  it('never blocks on a single overlapping row alone', () => {
    const loneRow = baseRow(2, {
      saleDate: '2026-03-01',
      customerName: 'Metro',
      productName: 'Bread',
      quantity: 2,
      saleNumber: 'INV-10',
    });
    const loneFingerprint = buildDuplicateImportRowFingerprint(loneRow);

    const review = reviewWithRows([
      loneRow,
      baseRow(3, {
        saleDate: '2026-03-02',
        customerName: 'Fresh',
        productName: 'Cake',
        quantity: 1,
        saleNumber: 'INV-11',
      }),
      baseRow(4, {
        saleDate: '2026-03-03',
        customerName: 'Fresh',
        productName: 'Tart',
        quantity: 1,
        saleNumber: 'INV-12',
      }),
    ]);

    const result = detectDuplicateImport({
      resolvedReview: review,
      importHistory: [
        historyRecord({
          importId: 'imp-one-row',
          fileFingerprint: 'different',
          rowFingerprints: [loneFingerprint],
          invoiceNumbers: [],
          rowCount: 1,
        }),
      ],
    });

    expect(result.status).toBe(DUPLICATE_IMPORT_STATUS.NO_DUPLICATE);
    expect(result.matchedRows).toBe(0);
  });

  it('processes 1000 rows within a reasonable time budget', () => {
    const rows = Array.from({ length: 1000 }, (_, index) =>
      baseRow(index + 2, {
        saleDate: '2026-03-01',
        customerName: `Store ${index}`,
        productName: 'Bread',
        quantity: 1,
        saleNumber: `INV-${index}`,
      }),
    );

    const fingerprints = buildDuplicateImportFingerprints(rows);
    const review = reviewWithRows(rows);

    const started = performance.now();
    const result = detectDuplicateImport({
      resolvedReview: review,
      importHistory: [
        historyRecord({
          importId: 'imp-1k',
          fileFingerprint: 'other',
          rowFingerprints: fingerprints.rowFingerprints.slice(0, 900),
          invoiceNumbers: fingerprints.invoiceNumbers.slice(0, 900),
          rowCount: 900,
        }),
      ],
    });
    const elapsed = performance.now() - started;

    expect(result.confidence).toBeGreaterThanOrEqual(90);
    expect(elapsed).toBeLessThan(1000);
  });

  it('processes 10000 rows within a reasonable time budget', () => {
    const rows = Array.from({ length: 10_000 }, (_, index) =>
      baseRow(index + 2, {
        saleDate: '2026-03-01',
        customerName: `Store ${index % 200}`,
        productName: 'Bread',
        quantity: 1,
        saleNumber: `INV-${index}`,
      }),
    );

    const fingerprints = buildDuplicateImportFingerprints(rows);
    const review = reviewWithRows(rows);

    const started = performance.now();
    detectDuplicateImport({
      resolvedReview: review,
      importHistory: [
        historyRecord({
          importId: 'imp-10k',
          fileFingerprint: fingerprints.fileFingerprint,
          rowFingerprints: fingerprints.rowFingerprints,
          invoiceNumbers: fingerprints.invoiceNumbers,
          rowCount: 10_000,
        }),
      ],
    });
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(5000);
  });
});

describe('buildDuplicateImportFileFingerprint stability', () => {
  it('produces the same fingerprint when only column order in source data differs', () => {
    const rowOne = baseRow(2, {
      saleDate: '2026-03-01',
      customerName: 'A',
      productName: 'Bread',
      quantity: 1,
      saleNumber: 'INV-1',
    });
    const rowTwo = baseRow(3, {
      quantity: 2,
      productName: 'Puff',
      customerName: 'B',
      saleDate: '2026-03-02',
      saleNumber: 'INV-2',
    });

    const ordered = buildDuplicateImportFileFingerprint([
      buildDuplicateImportRowFingerprint(rowOne),
      buildDuplicateImportRowFingerprint(rowTwo),
    ]);
    const reversed = buildDuplicateImportFileFingerprint([
      buildDuplicateImportRowFingerprint(rowTwo),
      buildDuplicateImportRowFingerprint(rowOne),
    ]);

    expect(ordered).toBe(reversed);
  });
});

describe('shouldResumeBlockedDuplicateImport', () => {
  const blocked = {
    status: DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE,
    confidence: 100,
    matchedImport: {
      importId: 'imp-1',
      importedAt: '2026-03-01T10:00:00.000Z',
      importedBy: 'owner@test',
      status: IMPORT_HISTORY_STATUS.IMPORTING,
    },
    matchedInvoices: [],
    matchedRows: 1,
    duplicateRowFingerprints: ['fp'],
    duplicateReasons: ['Identical file fingerprint to a completed import.'],
    recommendation: DUPLICATE_IMPORT_RECOMMENDATION.BLOCK_IMPORT,
  };

  it('resumes IMPORTING, IMPORTED, FINALIZING, and FAILED exact-file blocks', () => {
    for (const status of [
      IMPORT_HISTORY_STATUS.IMPORTING,
      IMPORT_HISTORY_STATUS.IMPORTED,
      IMPORT_HISTORY_STATUS.FINALIZING,
      IMPORT_HISTORY_STATUS.FAILED,
    ]) {
      expect(
        shouldResumeBlockedDuplicateImport({
          ...blocked,
          matchedImport: { ...blocked.matchedImport, status },
        }),
      ).toBe(true);
    }
  });

  it('does not resume a completed exact-file block', () => {
    expect(
      shouldResumeBlockedDuplicateImport({
        ...blocked,
        matchedImport: { ...blocked.matchedImport, status: IMPORT_HISTORY_STATUS.COMPLETED },
      }),
    ).toBe(false);
  });
});
