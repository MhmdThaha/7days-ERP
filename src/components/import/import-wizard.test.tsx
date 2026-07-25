// @vitest-environment jsdom
/**
 * Wizard flow tests for Preview → Conflict Detection → Conflict Review → Commit.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionResult } from '@/lib/utils/action-result';
import type { ConflictDetectionResult } from '@/lib/import/services/conflict.service';
import type { ImportAnalysis } from '@/types/import';
import type { SaleConflictDetectionResult } from '@/lib/import/services/sale-conflict.service';

vi.mock('@/actions/import', () => ({
  getImportSheetsAction: vi.fn(),
  analyzeImportAction: vi.fn(),
  revalidateImportMappingAction: vi.fn(),
  detectImportConflictsAction: vi.fn(),
  commitImportWithResolutionAction: vi.fn(),
}));

import {
  analyzeImportAction,
  commitImportWithResolutionAction,
  detectImportConflictsAction,
  getImportSheetsAction,
  revalidateImportMappingAction,
} from '@/actions/import';
import { ImportWizard } from '@/components/import/import-wizard';
import { PRODUCT_IMPORT_REPORT, SALES_DETAIL_REPORT } from '@/lib/import/reports';

afterEach(cleanup);

type MappingReviewFixtureReport = {
  reportType: string;
  displayName: string;
};

function withMappingReview(
  base: Omit<ImportAnalysis, 'mappingReview' | 'autoMappingSnapshot' | 'guidance' | 'diagnostics'>,
  report: MappingReviewFixtureReport = {
    reportType: PRODUCT_IMPORT_REPORT.reportType,
    displayName: PRODUCT_IMPORT_REPORT.displayName,
  },
): ImportAnalysis {
  return {
    ...base,
    mappingReview: {
      reportType: report.reportType,
      viewModel: {
        reportDisplayName: report.displayName,
        reportConfidence: 0.85,
        mappingConfidence: 0.8,
        reportType: report.reportType,
        canSaveMapping: report.reportType !== 'unknown',
        mappedHeaders: base.mapping.columnMappings.map((entry) => entry.sourceHeader),
        unmappedHeaders: base.unmappedHeaders,
        ignoredHeaders: [],
        ambiguousHeaders: [],
        rows: base.mapping.columnMappings.map((entry) => ({
          sourceHeader: entry.sourceHeader,
          status: 'mapped' as const,
          targetField: entry.targetField,
          targetFieldLabel: entry.targetField,
          mappingSource: 'auto' as const,
          autoSuggestion: null,
          ambiguousCandidates: [],
        })),
      },
      baseline: {
        entries: Object.fromEntries(
          base.mapping.columnMappings.map((entry) => [
            entry.sourceHeader,
            { kind: 'mapped' as const, targetField: entry.targetField, origin: 'auto' as const },
          ]),
        ),
      },
    },
    autoMappingSnapshot: {
      mappedFields: base.mapping.columnMappings.map((entry) => ({
        sourceHeader: entry.sourceHeader,
        targetField: entry.targetField,
        score: 90,
      })),
      ambiguousMappings: [],
      ignoredHeaders: [],
      unmappedHeaders: base.unmappedHeaders,
    },
    guidance: { items: [] },
    diagnostics: {
      pipelineStages: [],
      executionTime: {
        totalMs: 0,
        startedAt: '2026-07-24T00:00:00.000Z',
        completedAt: '2026-07-24T00:00:00.000Z',
      },
      detectedHeaderRow: 0,
      detectedHeaders: [],
      reportType: report.reportType,
      reportConfidence: 0.85,
      profileId: report.reportType,
      mappingStatistics: {
        mappedCount: base.mapping.columnMappings.length,
        unmappedCount: base.unmappedHeaders.length,
        ignoredCount: 0,
        ambiguousCount: 0,
        mappingConfidence: 0.8,
      },
      savedMappingStatistics: {
        usedSavedMapping: false,
        appliedCount: base.mapping.columnMappings.length,
        appliedFromSavedCount: 0,
        appliedFromAutoCount: base.mapping.columnMappings.length,
        skippedCount: 0,
        outdatedCount: 0,
        newMappingsNeededCount: base.unmappedHeaders.length,
        versionMismatch: false,
        savedMappingVersion: null,
        confidence: 0.8,
      },
      validationSummary: {
        totalRows: base.report.result.summary.totalRows,
        validRows: base.report.result.summary.validRows,
        warningRows: base.report.result.summary.warningRows,
        errorRows: base.report.result.summary.errorRows,
        missingRequiredFields: base.report.missingRequiredFields,
        missingSourceHeaders: base.report.missingSourceHeaders,
        ignoredHeaders: base.report.ignoredHeaders,
        issueCodeCounts: {},
        skippedEmptyRowCount: base.report.skippedEmptyRowCount,
      },
      guidanceSummary: {
        totalItems: 0,
        infoCount: 0,
        warningCount: 0,
        errorCount: 0,
        codes: [],
      },
      warnings: [],
      errors: [],
    },
  };
}

const analysis = withMappingReview({
  fileName: 'items.xlsx',
  sheetName: 'Items',
  mapping: {
    columnMappings: [
      { sourceHeader: 'Item Name', targetField: 'name' },
      { sourceHeader: 'Sale Price', targetField: 'sellingPrice' },
    ],
  },
  unmappedHeaders: [],
  report: {
    entityType: 'product',
    sheetName: 'Items',
    headers: ['Item Name', 'Sale Price'],
    skippedEmptyRowCount: 0,
    ignoredHeaders: [],
    missingSourceHeaders: [],
    missingRequiredFields: [],
    result: {
      rows: [
        {
          rowNumber: 2,
          values: { name: 'Milk Bread', sellingPrice: 45 },
          issues: [],
          status: 'valid',
        },
        {
          rowNumber: 3,
          values: { name: 'Veg Puff', sellingPrice: 25 },
          issues: [],
          status: 'valid',
        },
      ],
      summary: { totalRows: 2, validRows: 2, warningRows: 0, errorRows: 0 },
    },
  },
});

const saleAnalysis = withMappingReview(
  {
  fileName: 'sales.xlsx',
  sheetName: 'Sales',
  mapping: {
    columnMappings: [
      { sourceHeader: 'Sale Date', targetField: 'saleDate' },
      { sourceHeader: 'Product Name', targetField: 'productName' },
      { sourceHeader: 'Qty', targetField: 'quantity' },
    ],
  },
  unmappedHeaders: [],
  report: {
    entityType: 'sale',
    sheetName: 'Sales',
    headers: ['Sale Date', 'Product Name', 'Qty'],
    skippedEmptyRowCount: 0,
    ignoredHeaders: [],
    missingSourceHeaders: [],
    missingRequiredFields: [],
    result: {
      rows: [
        {
          rowNumber: 2,
          values: {
            saleDate: '2026-03-01',
            productName: 'Milk Bread',
            quantity: 2,
          },
          issues: [],
          status: 'valid',
        },
        {
          rowNumber: 3,
          values: {
            saleDate: '2026-03-02',
            productName: 'Veg Puff',
            quantity: 1,
          },
          issues: [],
          status: 'valid',
        },
      ],
      summary: { totalRows: 2, validRows: 2, warningRows: 0, errorRows: 0 },
    },
  },
  },
  {
    reportType: SALES_DETAIL_REPORT.reportType,
    displayName: SALES_DETAIL_REPORT.displayName,
  },
);

const noSaleConflicts: SaleConflictDetectionResult = {
  exactDuplicateSales: [],
  conflictingDuplicateSales: [],
  existingSales: [],
  cleanGroups: [],
  conflictingGroups: [],
  summary: {
    totalChecked: 2,
    exactDuplicateGroupCount: 0,
    exactDuplicateSaleCount: 0,
    conflictingDuplicateGroupCount: 0,
    conflictingDuplicateSaleCount: 0,
    existingSaleCount: 0,
    cleanGroupCount: 2,
    conflictingGroupCount: 0,
    lineErrorGroupCount: 0,
    groupIssueGroupCount: 0,
  },
};

const noConflicts: ConflictDetectionResult = {
  duplicateRowsInFile: [],
  exactDuplicateRows: [],
  existingProducts: [],
  duplicateProductCodes: [],
  cleanRows: [2, 3],
  summary: {
    totalChecked: 2,
    exactDuplicateRowCount: 0,
    exactDuplicateNameCount: 0,
    conflictingDuplicateRowCount: 0,
    conflictingDuplicateNameCount: 0,
    duplicateNameCount: 0,
    duplicateRowCount: 0,
    existingProductCount: 0,
    existingProductNameCount: 0,
    cleanRowCount: 2,
    duplicateProductCodeCount: 0,
  },
};

function renderSaleWizard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ImportWizard
        entityType="sale"
        entityLabel="Sales"
        entityLabelSingular="Sale"
        returnHref="/sales"
        returnLabel="Return to Sales"
      />
    </QueryClientProvider>,
  );
}

function renderWizard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ImportWizard
        entityType="product"
        entityLabel="Products"
        entityLabelSingular="Product"
        returnHref="/products"
        returnLabel="Return to Products"
      />
    </QueryClientProvider>,
  );
}

async function goToPreview(container: HTMLElement) {
  vi.mocked(getImportSheetsAction).mockResolvedValue({
    success: true,
    data: { sheetNames: ['Items'] },
  });
  vi.mocked(analyzeImportAction).mockResolvedValue({ success: true, data: analysis });
  vi.mocked(revalidateImportMappingAction).mockResolvedValue({ success: true, data: analysis });

  const input = container.querySelector('input[type="file"]');
  const file = new File(['Item Name,Sale Price\nMilk Bread,45\n'], 'items.xlsx');

  fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));

  await screen.findByText('Column mapping');
  fireEvent.click(screen.getByRole('button', { name: /continue to preview/i }));

  return screen.findByRole('button', { name: /import 2 products/i });
}

async function goToSalePreview(container: HTMLElement) {
  vi.mocked(getImportSheetsAction).mockResolvedValue({
    success: true,
    data: { sheetNames: ['Sales'] },
  });
  vi.mocked(analyzeImportAction).mockResolvedValue({ success: true, data: saleAnalysis });
  vi.mocked(revalidateImportMappingAction).mockResolvedValue({ success: true, data: saleAnalysis });

  const input = container.querySelector('input[type="file"]');
  const file = new File(['Sale Date,Product Name,Qty\n2026-03-01,Milk Bread,2\n'], 'sales.xlsx');

  fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));

  await screen.findByText('Column mapping');
  fireEvent.click(screen.getByRole('button', { name: /continue to preview/i }));

  return screen.findByRole('button', { name: /import 2 sales/i });
}

beforeEach(() => {
  vi.mocked(getImportSheetsAction).mockReset();
  vi.mocked(analyzeImportAction).mockReset();
  vi.mocked(revalidateImportMappingAction).mockReset();
  vi.mocked(detectImportConflictsAction).mockReset();
  vi.mocked(commitImportWithResolutionAction).mockReset();
});

describe('ImportWizard mapping review flow', () => {
  it('shows Mapping Review after analyze and revalidates before preview', async () => {
    const { container } = renderWizard();

    vi.mocked(getImportSheetsAction).mockResolvedValue({
      success: true,
      data: { sheetNames: ['Items'] },
    });
    vi.mocked(analyzeImportAction).mockResolvedValue({ success: true, data: analysis });
    vi.mocked(revalidateImportMappingAction).mockResolvedValue({ success: true, data: analysis });

    const input = container.querySelector('input[type="file"]');
    const file = new File(['Item Name,Sale Price\nMilk Bread,45\n'], 'items.xlsx');

    fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByText('Column mapping')).toBeDefined();
    expect(screen.getByText('Product Import')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /continue to preview/i }));

    expect(await screen.findByRole('button', { name: /import 2 products/i })).toBeDefined();
    expect(vi.mocked(revalidateImportMappingAction)).toHaveBeenCalledWith(
      'product',
      expect.any(FormData),
      analysis.mapping,
      undefined,
    );
  });

  it('passes saveMapping option on commit when enabled in mapping step', async () => {
    const { container } = renderWizard();

    vi.mocked(getImportSheetsAction).mockResolvedValue({
      success: true,
      data: { sheetNames: ['Items'] },
    });
    vi.mocked(analyzeImportAction).mockResolvedValue({ success: true, data: analysis });
    vi.mocked(revalidateImportMappingAction).mockResolvedValue({ success: true, data: analysis });
    vi.mocked(detectImportConflictsAction).mockResolvedValue({
      success: true,
      data: noConflicts,
    });
    vi.mocked(commitImportWithResolutionAction).mockResolvedValue({
      success: true,
      data: {
        strategy: 'new-only',
        durationMs: 500,
        result: {
          importedCount: 2,
          skippedCount: 0,
          failedCount: 0,
          updatedCount: 0,
          documentIds: ['doc-1', 'doc-2'],
          updatedDocumentIds: [],
          rowResults: [],
          commitErrors: [],
        },
      },
    });

    const input = container.querySelector('input[type="file"]');
    const file = new File(['Item Name,Sale Price\nMilk Bread,45\n'], 'items.xlsx');

    fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await screen.findByText('Column mapping');

    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: /continue to preview/i }));
    await screen.findByRole('button', { name: /import 2 products/i });

    fireEvent.click(screen.getByRole('button', { name: /import 2 products/i }));
    await screen.findByText('No conflicts detected');
    fireEvent.click(screen.getByRole('button', { name: /import new products only/i }));

    expect(await screen.findByText('Import complete')).toBeDefined();
    expect(vi.mocked(commitImportWithResolutionAction)).toHaveBeenCalledWith(
      analysis.report,
      noConflicts,
      'new-only',
      {
        saveMapping: true,
        mapping: analysis.mapping,
        reportType: 'product-import',
      },
    );
  });
});

describe('ImportWizard conflict review flow', () => {
  it('runs conflict detection on Import and shows the conflict review screen', async () => {
    const { container } = renderWizard();
    const importButton = await goToPreview(container);

    let resolveDetect!: (value: ActionResult<ConflictDetectionResult>) => void;
    vi.mocked(detectImportConflictsAction).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDetect = resolve;
        }),
    );

    fireEvent.click(importButton);
    fireEvent.click(importButton);

    expect(vi.mocked(detectImportConflictsAction)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(detectImportConflictsAction)).toHaveBeenCalledWith(analysis.report);

    expect(await screen.findByText(/checking for conflicts/i)).toBeDefined();

    resolveDetect({ success: true, data: noConflicts });

    expect(await screen.findByText('No conflicts detected')).toBeDefined();
    expect(screen.getByRole('button', { name: /import new products only/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /update existing products/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeDefined();
  });

  it('returns to preview when Cancel is clicked on the conflict screen', async () => {
    const { container } = renderWizard();
    const importButton = await goToPreview(container);

    vi.mocked(detectImportConflictsAction).mockResolvedValue({
      success: true,
      data: noConflicts,
    });

    fireEvent.click(importButton);
    await screen.findByText('No conflicts detected');

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(
      await screen.findByRole('button', { name: /import 2 products/i }),
    ).toBeDefined();
  });

  it('commits with new-only strategy and shows the result screen', async () => {
    const { container } = renderWizard();
    const importButton = await goToPreview(container);

    vi.mocked(detectImportConflictsAction).mockResolvedValue({
      success: true,
      data: noConflicts,
    });
    vi.mocked(commitImportWithResolutionAction).mockResolvedValue({
      success: true,
      data: {
        strategy: 'new-only',
        durationMs: 500,
        result: {
          importedCount: 2,
          skippedCount: 0,
          failedCount: 0,
          updatedCount: 0,
          documentIds: ['doc-1', 'doc-2'],
          updatedDocumentIds: [],
          rowResults: [
            { rowNumber: 2, status: 'imported', documentId: 'doc-1' },
            { rowNumber: 3, status: 'imported', documentId: 'doc-2' },
          ],
          commitErrors: [],
        },
      },
    });

    fireEvent.click(importButton);
    await screen.findByText('No conflicts detected');

    fireEvent.click(screen.getByRole('button', { name: /import new products only/i }));

    expect(await screen.findByText('Import complete')).toBeDefined();
    expect(vi.mocked(commitImportWithResolutionAction)).toHaveBeenCalledWith(
      analysis.report,
      noConflicts,
      'new-only',
      {
        saveMapping: false,
        mapping: analysis.mapping,
        reportType: 'product-import',
      },
    );
  });

  it('commits with update-existing strategy when chosen', async () => {
    const { container } = renderWizard();
    const importButton = await goToPreview(container);

    const withExisting: ConflictDetectionResult = {
      ...noConflicts,
      existingProducts: [
        {
          rowNumber: 2,
          name: 'Milk Bread',
          normalizedName: 'milk bread',
          existingProduct: { id: 'p1', name: 'Milk Bread', code: 'MB-1' },
        },
      ],
      cleanRows: [3],
      summary: {
        totalChecked: 2,
        exactDuplicateRowCount: 0,
        exactDuplicateNameCount: 0,
        conflictingDuplicateRowCount: 0,
        conflictingDuplicateNameCount: 0,
        duplicateNameCount: 0,
        duplicateRowCount: 0,
        existingProductCount: 1,
        existingProductNameCount: 1,
        cleanRowCount: 1,
        duplicateProductCodeCount: 0,
      },
    };

    vi.mocked(detectImportConflictsAction).mockResolvedValue({
      success: true,
      data: withExisting,
    });
    vi.mocked(commitImportWithResolutionAction).mockResolvedValue({
      success: true,
      data: {
        strategy: 'update-existing',
        durationMs: 800,
        result: {
          importedCount: 1,
          updatedCount: 1,
          skippedCount: 0,
          failedCount: 0,
          documentIds: ['doc-2'],
          updatedDocumentIds: ['p1'],
          rowResults: [
            { rowNumber: 2, status: 'imported', documentId: 'p1' },
            { rowNumber: 3, status: 'imported', documentId: 'doc-2' },
          ],
          commitErrors: [],
        },
      },
    });

    fireEvent.click(importButton);
    await screen.findByText(/already exist in BakeryOS/i);

    fireEvent.click(screen.getByRole('button', { name: /update existing products/i }));

    expect(await screen.findByText('Import complete')).toBeDefined();
    expect(vi.mocked(commitImportWithResolutionAction)).toHaveBeenCalledWith(
      analysis.report,
      withExisting,
      'update-existing',
      {
        saveMapping: false,
        mapping: analysis.mapping,
        reportType: 'product-import',
      },
    );
  });

  it('stays on preview when conflict detection fails', async () => {
    const { container } = renderWizard();
    const importButton = await goToPreview(container);

    vi.mocked(detectImportConflictsAction).mockResolvedValue({
      success: false,
      error: 'Organization context is not configured.',
      code: 'ORG_NOT_CONFIGURED',
    });

    fireEvent.click(importButton);

    const retryButton = await screen.findByRole('button', {
      name: /import 2 products/i,
    });
    expect(retryButton.hasAttribute('disabled')).toBe(false);
    expect(screen.queryByText('No conflicts detected')).toBeNull();
  });
});

describe('ImportWizard sale conflict review flow', () => {
  it('runs conflict detection and shows sale-specific conflict review actions', async () => {
    const { container } = renderSaleWizard();
    const importButton = await goToSalePreview(container);

    vi.mocked(detectImportConflictsAction).mockResolvedValue({
      success: true,
      data: noSaleConflicts,
    });

    fireEvent.click(importButton);

    expect(await screen.findByText('No conflicts detected')).toBeDefined();
    expect(screen.getByRole('button', { name: /import sales/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /update existing/i })).toBeNull();
  });

  it('commits sales with new-only strategy and shows the result screen', async () => {
    const { container } = renderSaleWizard();
    const importButton = await goToSalePreview(container);

    vi.mocked(detectImportConflictsAction).mockResolvedValue({
      success: true,
      data: noSaleConflicts,
    });
    vi.mocked(commitImportWithResolutionAction).mockResolvedValue({
      success: true,
      data: {
        strategy: 'new-only',
        durationMs: 600,
        result: {
          importedCount: 2,
          skippedCount: 0,
          failedCount: 0,
          saleIds: ['sale-1', 'sale-2'],
          saleNumbers: ['INV-1', 'INV-2'],
          groupResults: [],
          commitErrors: [],
        },
      },
    });

    fireEvent.click(importButton);
    await screen.findByText('No conflicts detected');

    fireEvent.click(screen.getByRole('button', { name: /import sales/i }));

    expect(await screen.findByText('Import complete')).toBeDefined();
    expect(screen.getByText(/inventory was updated/i)).toBeDefined();
    expect(vi.mocked(commitImportWithResolutionAction)).toHaveBeenCalledWith(
      saleAnalysis.report,
      noSaleConflicts,
      'new-only',
      {
        saveMapping: false,
        mapping: saleAnalysis.mapping,
        reportType: 'sales-detail',
      },
    );
  });
});
