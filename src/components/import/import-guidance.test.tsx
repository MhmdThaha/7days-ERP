// @vitest-environment jsdom
/**
 * Import Guidance panel component tests — presentation only.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ImportGuidancePanel } from '@/components/import/import-guidance';
import type { ImportGuidanceResult } from '@/lib/import/guidance/types';

afterEach(cleanup);

describe('ImportGuidancePanel', () => {
  it('renders guidance items with title and message', () => {
    const guidance: ImportGuidanceResult = {
      items: [
        {
          code: 'INVENTORY_WILL_NOT_UPDATE',
          severity: 'info',
          title: 'Inventory will not be updated',
          message:
            'This report does not contain line-item quantities, so inventory will not change.',
          recommendation: 'Use a line-item sales report if you need stock levels adjusted.',
          relatedFields: [],
        },
        {
          code: 'AMBIGUOUS_MAPPING',
          severity: 'warning',
          title: 'Ambiguous column mapping',
          message: 'Two columns could map to "Quantity" and "Units".',
          recommendation: 'Choose the correct field for this column in the mapping table.',
          relatedFields: ['Qty'],
        },
      ],
    };

    render(<ImportGuidancePanel guidance={guidance} />);

    expect(screen.getByText('Inventory will not be updated')).toBeDefined();
    expect(screen.getByText(/inventory will not change/i)).toBeDefined();
    expect(screen.getByText('Ambiguous column mapping')).toBeDefined();
    expect(screen.getByText(/Choose the correct field/i)).toBeDefined();
  });

  it('renders nothing when guidance is empty', () => {
    const { container } = render(<ImportGuidancePanel guidance={{ items: [] }} />);

    expect(container.firstChild).toBeNull();
  });
});
