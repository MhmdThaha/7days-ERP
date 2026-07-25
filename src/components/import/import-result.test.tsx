// @vitest-environment jsdom
/**
 * Import Result screen tests — the three banner tones (success, partial,
 * failure), the failure-details table, and the finish actions.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CommitImportOutcome } from '@/actions/import';
import { ImportResult } from '@/components/import/import-result';
import type { CommitRowResult } from '@/lib/import/services/commit.service';
import type { SaleImportCommitResult } from '@/lib/import/services/sale-import-commit.service';

afterEach(cleanup);

function outcome(rowResults: CommitRowResult[], durationMs = 1234): CommitImportOutcome {
  const imported = rowResults.filter((row) => row.status === 'imported');
  const failed = rowResults.filter((row) => row.status === 'failed');
  const skipped = rowResults.filter((row) => row.status === 'skipped');

  return {
    durationMs,
    strategy: 'new-only' as const,
    result: {
      importedCount: imported.length,
      skippedCount: skipped.length,
      failedCount: failed.length,
      documentIds: imported.map((row) => row.documentId ?? ''),
      rowResults,
      commitErrors: failed.length
        ? [
            {
              batchIndex: 0,
              rowNumbers: failed.map((row) => row.rowNumber),
              message: 'Firestore unavailable',
            },
          ]
        : [],
    },
  };
}

const baseProps = {
  fileName: 'vyapar-items.xlsx',
  warningRows: 1,
  entityLabel: 'Products',
  returnHref: '/products',
  returnLabel: 'Return to Products',
};

describe('ImportResult', () => {
  it('shows Created and skipped exact duplicate tiles when present', () => {
    render(
      <ImportResult
        {...baseProps}
        entityType="product"
        outcome={{
          durationMs: 500,
          strategy: 'new-only',
          result: {
            importedCount: 1,
            updatedCount: 0,
            skippedCount: 0,
            skippedExistingCount: 0,
            skippedExactDuplicateCount: 1,
            failedCount: 0,
            documentIds: ['doc-1'],
            updatedDocumentIds: [],
            rowResults: [],
            commitErrors: [],
          },
        }}
        onImportAnother={() => {}}
      />,
    );

    expect(screen.getByText('Created')).toBeDefined();
    expect(screen.getByText('Skipped exact duplicates')).toBeDefined();
  });

  it('shows the green success banner when everything imported', () => {
    render(
      <ImportResult
        {...baseProps}
        entityType="product"
        outcome={outcome([
          { rowNumber: 2, status: 'imported', documentId: 'doc-1' },
          { rowNumber: 3, status: 'imported', documentId: 'doc-2' },
        ])}
        onImportAnother={() => {}}
      />,
    );

    expect(screen.getByText('Import complete')).toBeDefined();
    expect(screen.getByText(/2 products from vyapar-items.xlsx/i)).toBeDefined();
    // File name + duration line.
    expect(screen.getByText(/in 1.2 s/i)).toBeDefined();
  });

  it('shows the warning banner and failure details for a partial import', () => {
    render(
      <ImportResult
        {...baseProps}
        entityType="product"
        outcome={outcome([
          { rowNumber: 2, status: 'imported', documentId: 'doc-1' },
          { rowNumber: 5, status: 'failed', reason: 'Firestore unavailable' },
        ])}
        onImportAnother={() => {}}
      />,
    );

    expect(screen.getByText('Import partially complete')).toBeDefined();

    // Failure details: spreadsheet row + reason are visible.
    expect(screen.getByText('Failed rows')).toBeDefined();
    expect(screen.getByRole('cell', { name: '5' })).toBeDefined();
    expect(screen.getByRole('cell', { name: 'Firestore unavailable' })).toBeDefined();
  });

  it('shows the destructive banner when nothing was imported', () => {
    render(
      <ImportResult
        {...baseProps}
        entityType="product"
        outcome={outcome([{ rowNumber: 2, status: 'failed', reason: 'Firestore unavailable' }])}
        onImportAnother={() => {}}
      />,
    );

    expect(screen.getByText('Import failed')).toBeDefined();
    expect(screen.getByText(/was not changed/i)).toBeDefined();
  });

  it('renders the finish actions: return link and import-another', () => {
    const onImportAnother = vi.fn();

    render(
      <ImportResult
        {...baseProps}
        entityType="product"
        outcome={outcome([{ rowNumber: 2, status: 'imported', documentId: 'doc-1' }])}
        onImportAnother={onImportAnother}
      />,
    );

    // The design system renders link-buttons as <a role="button">.
    const returnLink = screen.getByRole('button', { name: 'Return to Products' });
    expect(returnLink.tagName).toBe('A');
    expect(returnLink.getAttribute('href')).toBe('/products');

    fireEvent.click(screen.getByRole('button', { name: /import another file/i }));
    expect(onImportAnother).toHaveBeenCalledTimes(1);
  });
});

describe('ImportResult (sales)', () => {
  const saleBaseProps = {
    fileName: 'vyapar-sales.xlsx',
    warningRows: 0,
    entityLabel: 'Sales',
    returnHref: '/sales',
    returnLabel: 'Return to Sales',
  };

  function saleOutcome(result: SaleImportCommitResult, durationMs = 900): CommitImportOutcome {
    return {
      durationMs,
      strategy: 'new-only',
      result,
    };
  }

  it('shows the success banner when sales were imported', () => {
    render(
      <ImportResult
        {...saleBaseProps}
        entityType="sale"
        outcome={saleOutcome({
          importedCount: 2,
          skippedCount: 0,
          failedCount: 0,
          saleIds: ['sale-1', 'sale-2'],
          saleNumbers: ['INV-1', 'INV-2'],
          groupResults: [],
          commitErrors: [],
        })}
        onImportAnother={() => {}}
      />,
    );

    expect(screen.getByText('Import complete')).toBeDefined();
    expect(screen.getByText(/2 sales from vyapar-sales.xlsx/i)).toBeDefined();
    expect(screen.getByText(/inventory was updated/i)).toBeDefined();
  });

  it('shows failed sale groups for a partial import', () => {
    render(
      <ImportResult
        {...saleBaseProps}
        entityType="sale"
        outcome={saleOutcome({
          importedCount: 1,
          skippedCount: 0,
          failedCount: 1,
          saleIds: ['sale-1'],
          saleNumbers: ['INV-1'],
          groupResults: [
            {
              groupKey: 'number:INV-2',
              rowNumbers: [4, 5],
              status: 'failed',
              reason: 'Product not found',
            },
          ],
          commitErrors: [],
        })}
        onImportAnother={() => {}}
      />,
    );

    expect(screen.getByText('Import partially complete')).toBeDefined();
    expect(screen.getByText('Failed sales')).toBeDefined();
    expect(screen.getByRole('cell', { name: '4, 5' })).toBeDefined();
    expect(screen.getByRole('cell', { name: 'Product not found' })).toBeDefined();
  });
});
