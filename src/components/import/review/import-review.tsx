'use client';

import { ImportReviewNoErrorsState, ImportReviewNoFileState, ImportReviewNoRowsState, ImportReviewNoWarningsState } from '@/components/import/review/import-review-empty-states';
import { ImportReviewOverview } from '@/components/import/review/import-review-overview';
import { ImportReviewReportSummary } from '@/components/import/review/import-review-report-summary';
import { ImportReviewRowTable } from '@/components/import/review/import-review-row-table';
import type { ImportReviewResolutionHandlers } from '@/components/import/review/import-review-row-table';
import type { ImportReviewViewModel } from '@/lib/import/review/types';

type ImportReviewProps = {
  /** Pre-analyzed review payload — null shows the no-file empty state. */
  viewModel: ImportReviewViewModel | null;
  /** Optional Phase 8 resolution handlers — when omitted, review stays read-only. */
  resolution?: ImportReviewResolutionHandlers;
};

/**
 * Read-only import review experience (Phase 6).
 * Visualizes engine outputs only — no matching, conflict, or scoring logic.
 */
export function ImportReview({ viewModel, resolution }: ImportReviewProps) {
  if (!viewModel) {
    return <ImportReviewNoFileState />;
  }

  if (viewModel.rows.length === 0) {
    return (
      <div className="space-y-6">
        <ImportReviewOverview overview={viewModel.overview} />
        <ImportReviewReportSummary summary={viewModel.reportSummary} />
        <ImportReviewNoRowsState />
      </div>
    );
  }

  const hasErrors = viewModel.overview.errorRows > 0;
  const hasWarnings = viewModel.overview.warningRows > 0;

  return (
    <div className="space-y-6">
      <ImportReviewOverview overview={viewModel.overview} />
      <ImportReviewReportSummary summary={viewModel.reportSummary} />

      {!hasErrors ? <ImportReviewNoErrorsState /> : null}
      {!hasWarnings ? <ImportReviewNoWarningsState /> : null}

      <section aria-labelledby="import-review-rows-heading">
        <h2 id="import-review-rows-heading" className="mb-3 text-base font-semibold">
          Row review
        </h2>
        <ImportReviewRowTable rows={viewModel.rows} resolution={resolution} />
      </section>
    </div>
  );
}
