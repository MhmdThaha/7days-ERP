// @vitest-environment jsdom
/**
 * Conflict Review UI tests — summary counts, duplicate/existing sections,
 * empty state, and conflict resolution action buttons.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConflictReview } from '@/components/import/conflict-review';
import type { ConflictDetectionResult } from '@/lib/import/services/conflict.service';
import type { SaleConflictDetectionResult } from '@/lib/import/services/sale-conflict.service';

afterEach(cleanup);

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

function conflicts(
  overrides: Partial<Omit<ConflictDetectionResult, 'summary'>> & {
    summary?: Partial<ConflictDetectionResult['summary']>;
  } = {},
): ConflictDetectionResult {
  const base: ConflictDetectionResult = {
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

  return {
    ...base,
    ...overrides,
    summary: { ...base.summary, ...overrides.summary },
  };
}

function saleConflicts(
  overrides: Partial<Omit<SaleConflictDetectionResult, 'summary'>> & {
    summary?: Partial<SaleConflictDetectionResult['summary']>;
  } = {},
): SaleConflictDetectionResult {
  const base: SaleConflictDetectionResult = {
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

  return {
    ...base,
    ...overrides,
    summary: { ...base.summary, ...overrides.summary },
  };
}

describe('ConflictReview', () => {
  it('shows the no-conflicts empty state and summary counts', () => {
    render(
      <ConflictReview
        entityType="product"
        conflicts={conflicts()}
        entityLabel="Products"
        onCancel={() => {}}
        onImportNewOnly={() => {}}
        onUpdateExisting={() => {}}
        isCommitting={false}
      />,
    );

    expect(screen.getByText('No conflicts detected')).toBeDefined();
    expect(screen.getByText('Products checked')).toBeDefined();
    expect(screen.getByText('Ready to import', { selector: 'dt' })).toBeDefined();
    // Summary values
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(2);
  });

  it('lists unique conflicting duplicate product names from the file', () => {
    render(
      <ConflictReview
        entityType="product"
        conflicts={conflicts({
          duplicateRowsInFile: [
            {
              rowNumber: 2,
              name: 'Big Bread',
              normalizedName: 'big bread',
              conflictingRowNumbers: [4],
            },
            {
              rowNumber: 4,
              name: 'Big Bread',
              normalizedName: 'big bread',
              conflictingRowNumbers: [2],
            },
          ],
          cleanRows: [],
          summary: {
            totalChecked: 4,
            exactDuplicateRowCount: 0,
            exactDuplicateNameCount: 0,
            conflictingDuplicateRowCount: 2,
            conflictingDuplicateNameCount: 1,
            duplicateNameCount: 1,
            duplicateRowCount: 2,
            existingProductCount: 0,
            existingProductNameCount: 0,
            cleanRowCount: 0,
          },
        })}
        entityLabel="Products"
        onCancel={() => {}}
        onImportNewOnly={() => {}}
        onUpdateExisting={() => {}}
        isCommitting={false}
      />,
    );

    expect(screen.getByRole('list', { name: /conflicting duplicate product names/i })).toBeDefined();
    expect(screen.getByText('Requires resolution')).toBeDefined();

    const list = screen.getByRole('list', { name: /conflicting duplicate product names/i });
    expect(list.textContent).toContain('Big Bread');
    expect(list.querySelectorAll('li')).toHaveLength(1);
  });

  it('lists exact duplicates as automatically skipped', () => {
    render(
      <ConflictReview
        entityType="product"
        conflicts={conflicts({
          exactDuplicateRows: [
            {
              rowNumber: 3,
              name: 'Garlic Bread',
              normalizedName: 'garlic bread',
              keptRowNumber: 2,
            },
          ],
          cleanRows: [2],
          summary: {
            totalChecked: 2,
            exactDuplicateRowCount: 1,
            exactDuplicateNameCount: 1,
            conflictingDuplicateRowCount: 0,
            conflictingDuplicateNameCount: 0,
            duplicateNameCount: 0,
            duplicateRowCount: 0,
            existingProductCount: 0,
            existingProductNameCount: 0,
            cleanRowCount: 1,
          },
        })}
        entityLabel="Products"
        onCancel={() => {}}
        onImportNewOnly={() => {}}
        onUpdateExisting={() => {}}
        isCommitting={false}
      />,
    );

    expect(screen.getByRole('list', { name: /exact duplicate product names/i })).toBeDefined();
    expect(screen.getByText('Automatically skipped')).toBeDefined();
    expect(screen.getByText(/will be skipped automatically/i)).toBeDefined();
  });

  it('lists existing products already in BakeryOS', () => {
    render(
      <ConflictReview
        entityType="product"
        conflicts={conflicts({
          existingProducts: [
            {
              rowNumber: 2,
              name: 'Milk Bread',
              normalizedName: 'milk bread',
              existingProduct: { id: 'p1', name: 'Milk Bread', code: 'BRD-1' },
            },
            {
              rowNumber: 3,
              name: 'Big Bread',
              normalizedName: 'big bread',
              existingProduct: { id: 'p2', name: 'Big Bread', code: 'BRD-2' },
            },
          ],
          cleanRows: [],
          summary: {
            totalChecked: 2,
            exactDuplicateRowCount: 0,
            exactDuplicateNameCount: 0,
            conflictingDuplicateRowCount: 0,
            conflictingDuplicateNameCount: 0,
            duplicateNameCount: 0,
            duplicateRowCount: 0,
            existingProductCount: 2,
            existingProductNameCount: 2,
            cleanRowCount: 0,
          },
        })}
        entityLabel="Products"
        onCancel={() => {}}
        onImportNewOnly={() => {}}
        onUpdateExisting={() => {}}
        isCommitting={false}
      />,
    );

    expect(screen.getByText(/already exist in BakeryOS/i)).toBeDefined();

    const list = screen.getByRole('list', { name: /existing product names/i });
    expect(list.textContent).toContain('Milk Bread');
    expect(list.textContent).toContain('Big Bread');
  });

  it('renders the three action buttons and wires handlers', () => {
    const onCancel = vi.fn();
    const onImportNewOnly = vi.fn();
    const onUpdateExisting = vi.fn();

    render(
      <ConflictReview
        entityType="product"
        conflicts={conflicts()}
        entityLabel="Products"
        onCancel={onCancel}
        onImportNewOnly={onImportNewOnly}
        onUpdateExisting={onUpdateExisting}
        isCommitting={false}
      />,
    );

    expect(
      screen.getByRole('button', { name: /import new products only/i }),
    ).toBeDefined();
    expect(
      screen.getByRole('button', { name: /update existing products/i }),
    ).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /import new products only/i }));
    expect(onImportNewOnly).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /update existing products/i }));
    expect(onUpdateExisting).toHaveBeenCalledTimes(1);
  });

  it('shows existing product summary count matching the displayed list', () => {
    render(
      <ConflictReview
        entityType="product"
        conflicts={conflicts({
          existingProducts: [
            {
              rowNumber: 2,
              name: 'Garlic Bread',
              normalizedName: 'garlic bread',
              existingProduct: { id: 'p1', name: 'Garlic Bread', code: 'GB-1' },
            },
            {
              rowNumber: 4,
              name: 'Milk Bread',
              normalizedName: 'milk bread',
              existingProduct: { id: 'p2', name: 'Milk Bread', code: 'MB-1' },
            },
          ],
          exactDuplicateRows: [
            {
              rowNumber: 3,
              name: 'Garlic Bread',
              normalizedName: 'garlic bread',
              keptRowNumber: 2,
            },
            {
              rowNumber: 5,
              name: 'Milk Bread',
              normalizedName: 'milk bread',
              keptRowNumber: 4,
            },
          ],
          cleanRows: [6],
          summary: {
            totalChecked: 5,
            exactDuplicateRowCount: 2,
            exactDuplicateNameCount: 2,
            conflictingDuplicateRowCount: 0,
            conflictingDuplicateNameCount: 0,
            duplicateNameCount: 0,
            duplicateRowCount: 0,
            existingProductCount: 2,
            existingProductNameCount: 2,
            cleanRowCount: 1,
          },
        })}
        entityLabel="Products"
        onCancel={() => {}}
        onImportNewOnly={() => {}}
        onUpdateExisting={() => {}}
        isCommitting={false}
      />,
    );

    const list = screen.getByRole('list', { name: /existing product names/i });
    expect(list.querySelectorAll('li')).toHaveLength(2);

    const summaryTiles = screen.getAllByText('Existing products');
    const summaryTile = summaryTiles.find((node) => node.tagName === 'DT');
    expect(summaryTile?.parentElement?.textContent).toContain('2');
  });

  it('blocks import when duplicate product codes are shown', () => {
    render(
      <ConflictReview
        entityType="product"
        conflicts={conflicts({
          duplicateProductCodes: [
            {
              code: 'BB001',
              normalizedCode: 'BB001',
              rowNumbers: [2, 5],
            },
          ],
          cleanRows: [],
          summary: {
            totalChecked: 3,
            exactDuplicateRowCount: 0,
            exactDuplicateNameCount: 0,
            conflictingDuplicateRowCount: 0,
            conflictingDuplicateNameCount: 0,
            duplicateNameCount: 0,
            duplicateRowCount: 0,
            existingProductCount: 0,
            existingProductNameCount: 0,
            cleanRowCount: 0,
            duplicateProductCodeCount: 1,
          },
        })}
        entityLabel="Products"
        onCancel={() => {}}
        onImportNewOnly={() => {}}
        onUpdateExisting={() => {}}
        isCommitting={false}
      />,
    );

    expect(screen.getByText('Please fix your Excel before importing.')).toBeDefined();
    expect(screen.getByText('BB001')).toBeDefined();
    expect(screen.getByText(/Rows:/)).toBeDefined();
    expect(screen.getByText('2, 5')).toBeDefined();
    expect(screen.getByRole('button', { name: /import new products only/i }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.getByRole('button', { name: /update existing products/i }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('disables import actions while committing', () => {
    render(
      <ConflictReview
        entityType="product"
        conflicts={conflicts()}
        entityLabel="Products"
        onCancel={() => {}}
        onImportNewOnly={() => {}}
        onUpdateExisting={() => {}}
        isCommitting
      />,
    );

    expect(screen.getByRole('button', { name: /^cancel$/i }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(
      screen.getByRole('button', { name: /import new products only/i }).hasAttribute('disabled'),
    ).toBe(true);
  });
});

describe('ConflictReview (sales)', () => {
  it('shows the no-conflicts empty state and summary counts', () => {
    render(
      <ConflictReview
        entityType="sale"
        conflicts={saleConflicts()}
        entityLabel="Sales"
        onCancel={() => {}}
        onImportNewOnly={() => {}}
        onUpdateExisting={() => {}}
        isCommitting={false}
      />,
    );

    expect(screen.getByText('No conflicts detected')).toBeDefined();
    expect(screen.getByText('Sales checked')).toBeDefined();
    expect(screen.getByText('Ready to import', { selector: 'dt' })).toBeDefined();
  });

  it('lists existing sale numbers already in BakeryOS', () => {
    render(
      <ConflictReview
        entityType="sale"
        conflicts={saleConflicts({
          existingSales: [
            {
              groupKey: 'number:INV-1',
              saleNumber: 'INV-1',
              normalizedSaleNumber: 'INV-1',
              rowNumbers: [2],
              existingSale: {
                id: 's1',
                saleNumber: 'INV-1',
                saleDate: '2026-03-01',
                customerNameSnapshot: 'Shop A',
              },
            },
          ],
          cleanGroups: [],
          summary: {
            totalChecked: 1,
            existingSaleCount: 1,
            cleanGroupCount: 0,
          },
        })}
        entityLabel="Sales"
        onCancel={() => {}}
        onImportNewOnly={() => {}}
        onUpdateExisting={() => {}}
        isCommitting={false}
      />,
    );

    expect(screen.getByText(/already exist in BakeryOS/i)).toBeDefined();
    const list = screen.getByRole('list', { name: /existing sale numbers/i });
    expect(list.textContent).toContain('INV-1');
  });

  it('renders only the import action for sales (no update-existing)', () => {
    const onImportNewOnly = vi.fn();

    render(
      <ConflictReview
        entityType="sale"
        conflicts={saleConflicts()}
        entityLabel="Sales"
        onCancel={() => {}}
        onImportNewOnly={onImportNewOnly}
        onUpdateExisting={() => {}}
        isCommitting={false}
      />,
    );

    expect(screen.getByRole('button', { name: /import sales/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /update existing/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /import sales/i }));
    expect(onImportNewOnly).toHaveBeenCalledTimes(1);
  });

  it('blocks import when conflicting duplicate sale numbers are shown', () => {
    render(
      <ConflictReview
        entityType="sale"
        conflicts={saleConflicts({
          conflictingDuplicateSales: [
            {
              groupKey: 'number:INV-9',
              saleNumber: 'INV-9',
              normalizedSaleNumber: 'INV-9',
              rowNumbers: [2],
              conflictingGroupKeys: ['number:INV-9#2'],
            },
          ],
          cleanGroups: [],
          summary: {
            totalChecked: 2,
            conflictingDuplicateGroupCount: 2,
            conflictingDuplicateSaleCount: 1,
            cleanGroupCount: 0,
          },
        })}
        entityLabel="Sales"
        onCancel={() => {}}
        onImportNewOnly={() => {}}
        onUpdateExisting={() => {}}
        isCommitting={false}
      />,
    );

    expect(screen.getByText('Requires resolution')).toBeDefined();
    expect(screen.getByText('INV-9')).toBeDefined();
    expect(screen.getByRole('button', { name: /import sales/i }).hasAttribute('disabled')).toBe(
      true,
    );
  });
});
