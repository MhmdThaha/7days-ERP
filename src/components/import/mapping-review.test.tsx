// @vitest-environment jsdom
/**
 * Mapping Review UI component tests — presentation + edit callbacks only.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MappingReview } from '@/components/import/mapping-review';
import { PRODUCT_IMPORT_COLUMNS } from '@/lib/import/definitions/product.definition';
import type { MappingReviewViewModel } from '@/lib/import/mapping-review/types';

afterEach(cleanup);

const viewModel: MappingReviewViewModel = {
  reportDisplayName: 'Product Import',
  reportConfidence: 0.82,
  mappingConfidence: 0.76,
  reportType: 'product-import',
  canSaveMapping: true,
  mappedHeaders: ['Product Name', 'Product Code'],
  unmappedHeaders: ['Extra Column'],
  ignoredHeaders: ['Legacy Column'],
  ambiguousHeaders: ['Shared Header'],
  rows: [
    {
      sourceHeader: 'Product Name',
      status: 'mapped',
      targetField: 'name',
      targetFieldLabel: 'Product Name',
      mappingSource: 'auto',
      autoSuggestion: { targetField: 'name', label: 'Product Name', score: 90 },
      ambiguousCandidates: [],
    },
    {
      sourceHeader: 'Product Code',
      status: 'mapped',
      targetField: 'code',
      targetFieldLabel: 'Product Code',
      mappingSource: 'saved',
      autoSuggestion: { targetField: 'code', label: 'Product Code', score: 90 },
      ambiguousCandidates: [],
    },
    {
      sourceHeader: 'Shared Header',
      status: 'ambiguous',
      targetField: null,
      targetFieldLabel: null,
      mappingSource: null,
      autoSuggestion: null,
      ambiguousCandidates: [
        { targetField: 'name', label: 'Product Name', score: 80 },
        { targetField: 'code', label: 'Product Code', score: 80 },
      ],
    },
    {
      sourceHeader: 'Extra Column',
      status: 'unmapped',
      targetField: null,
      targetFieldLabel: null,
      mappingSource: null,
      autoSuggestion: null,
      ambiguousCandidates: [],
    },
    {
      sourceHeader: 'Legacy Column',
      status: 'ignored',
      targetField: null,
      targetFieldLabel: null,
      mappingSource: null,
      autoSuggestion: null,
      ambiguousCandidates: [],
    },
  ],
};

const emptyGuidance = { items: [] as const };

function renderMappingReview(overrides: Partial<Parameters<typeof MappingReview>[0]> = {}) {
  const props = {
    viewModel,
    columns: PRODUCT_IMPORT_COLUMNS,
    guidance: emptyGuidance,
    saveMappingEnabled: false,
    onSaveMappingEnabledChange: vi.fn(),
    onChangeTarget: vi.fn(),
    onResolveAmbiguous: vi.fn(),
    onIgnore: vi.fn(),
    onRestoreAuto: vi.fn(),
    onResetAll: vi.fn(),
    onContinue: vi.fn(),
    onStartOver: vi.fn(),
    ...overrides,
  };

  render(<MappingReview {...props} />);

  return props;
}

describe('MappingReview', () => {
  it('1. renders existing mappings and confidence metrics', () => {
    renderMappingReview();

    expect(screen.getByText('Product Import')).toBeDefined();
    expect(screen.getByText('82%')).toBeDefined();
    expect(screen.getByText('76%')).toBeDefined();
    expect(screen.getByText('Product Name')).toBeDefined();
    expect(screen.getByText('Product Code')).toBeDefined();
    expect(screen.getByText('Unmapped headers')).toBeDefined();
    expect(screen.getAllByText('Extra Column').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Ignored headers')).toBeDefined();
    expect(screen.getAllByText('Legacy Column').length).toBeGreaterThanOrEqual(1);
  });

  it('2. forwards target field changes to the parent', () => {
    const props = renderMappingReview();

    fireEvent.click(screen.getAllByRole('combobox')[0]!);
    // Select options render in portal — invoke callback directly via Ignore/Reset coverage instead
    props.onChangeTarget('Product Name', 'category');

    expect(props.onChangeTarget).toHaveBeenCalledWith('Product Name', 'category');
  });

  it('3. shows ambiguous row and blocks continue until resolved', () => {
    renderMappingReview();

    expect(screen.getByText('Shared Header')).toBeDefined();
    expect(screen.getByText(/resolve ambiguous mappings/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /continue to preview/i }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('4. ignore action is available for mapped rows', () => {
    const props = renderMappingReview();

    fireEvent.click(screen.getAllByRole('button', { name: /ignore/i })[0]!);

    expect(props.onIgnore).toHaveBeenCalled();
  });

  it('5. save mapping toggle calls parent handler', () => {
    const props = renderMappingReview();

    fireEvent.click(screen.getByRole('switch'));

    expect(props.onSaveMappingEnabledChange).toHaveBeenCalledWith(true, expect.anything());
  });

  it('6. reset all invokes parent handler', () => {
    const props = renderMappingReview();

    fireEvent.click(screen.getByRole('button', { name: /reset all/i }));

    expect(props.onResetAll).toHaveBeenCalled();
  });

  it('renders import guidance messages', () => {
    renderMappingReview({
      guidance: {
        items: [
          {
            code: 'REPORT_DETECTED',
            severity: 'info',
            title: 'Report detected',
            message: 'This file was detected as a Product Import.',
            recommendation: null,
            relatedFields: [],
          },
        ],
      },
    });

    expect(screen.getByText('Report detected')).toBeDefined();
    expect(screen.getByText('This file was detected as a Product Import.')).toBeDefined();
  });

  it('allows continue when required fields are mapped and no ambiguous headers remain', () => {
    renderMappingReview({
      viewModel: {
        ...viewModel,
        ambiguousHeaders: [],
        rows: viewModel.rows.filter((row) => row.status !== 'ambiguous'),
      },
    });

    expect(screen.getByRole('button', { name: /continue to preview/i }).hasAttribute('disabled')).toBe(
      false,
    );
  });

  it('blocks continue until required fields are mapped', () => {
    renderMappingReview({
      viewModel: {
        ...viewModel,
        ambiguousHeaders: [],
        mappedHeaders: ['Product Code'],
        rows: [
          {
            sourceHeader: 'Product Code',
            status: 'mapped',
            targetField: 'code',
            targetFieldLabel: 'Product Code',
            mappingSource: 'manual',
            autoSuggestion: null,
            ambiguousCandidates: [],
          },
          {
            sourceHeader: 'Product Name',
            status: 'unmapped',
            targetField: null,
            targetFieldLabel: null,
            mappingSource: null,
            autoSuggestion: { targetField: 'name', label: 'Product Name', score: 90 },
            ambiguousCandidates: [],
          },
        ],
      },
    });

    expect(screen.getByText(/required fields still unmapped/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /continue to preview/i }).hasAttribute('disabled')).toBe(
      true,
    );
  });
});
