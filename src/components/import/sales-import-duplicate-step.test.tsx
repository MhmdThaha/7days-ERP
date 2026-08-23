// @vitest-environment jsdom
/**
 * Duplicate warning step UI tests.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SalesImportDuplicateStep } from '@/components/import/sales-import-duplicate-step';
import {
  buildDuplicateImportWarning,
  type DuplicateImportWarning,
} from '@/lib/import/duplicate/duplicate-import-review';
import {
  DUPLICATE_IMPORT_RECOMMENDATION,
  DUPLICATE_IMPORT_STATUS,
} from '@/lib/import/duplicate';

afterEach(cleanup);

function warningFixture(overrides: Partial<DuplicateImportWarning> = {}): DuplicateImportWarning {
  return {
    ...buildDuplicateImportWarning({
      status: DUPLICATE_IMPORT_STATUS.POSSIBLE_DUPLICATE,
      confidence: 40,
      matchedImport: null,
      matchedInvoices: [],
      matchedRows: 2,
      duplicateRowFingerprints: ['fp-1', 'fp-2'],
      duplicateReasons: ['Possible duplicate.'],
      recommendation: DUPLICATE_IMPORT_RECOMMENDATION.REVIEW,
    }),
    ...overrides,
  };
}

describe('SalesImportDuplicateStep', () => {
  it('shows a friendly warning with Import anyway and Cancel', () => {
    render(
      <SalesImportDuplicateStep
        warning={warningFixture()}
        onCancel={() => undefined}
        onImportAnyway={() => undefined}
      />,
    );

    expect(screen.getByText('Similar sales found')).toBeDefined();
    expect(screen.getByText(/2 sales in this file look similar/i)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Import anyway' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDefined();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('calls onImportAnyway when confirmed', () => {
    const onImportAnyway = vi.fn();

    render(
      <SalesImportDuplicateStep
        warning={warningFixture()}
        onCancel={() => undefined}
        onImportAnyway={onImportAnyway}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Import anyway' }));

    expect(onImportAnyway).toHaveBeenCalledTimes(1);
  });

  it('shows exact-file wording for identical file imports', () => {
    render(
      <SalesImportDuplicateStep
        warning={warningFixture({
          kind: 'exact-file',
          title: 'This file was imported before',
          message: 'This Excel file looks exactly like one you imported earlier.',
        })}
        onCancel={() => undefined}
        onImportAnyway={() => undefined}
      />,
    );

    expect(screen.getByText('This file was imported before')).toBeDefined();
  });
});
