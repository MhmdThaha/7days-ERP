/**
 * Read-only duplicate analysis for the sales import review UI.
 */

import 'server-only';

import { type DuplicateImportResult } from '@/lib/import/duplicate';
import {
  buildDuplicateImportWarning,
  duplicateResultNeedsUserConfirmation,
  type DuplicateImportWarning,
} from '@/lib/import/duplicate/duplicate-import-review';
import { detectDuplicateImportWithCandidateLookup } from '@/lib/import/duplicate/import-duplicate-index-candidate.service';
import {
  prepareSalesImportResolvedReview,
  type PrepareSalesImportReviewInput,
} from '@/lib/import/integration/prepare-sales-import-review';

export type AnalyzeSalesImportDuplicatesResult = {
  status: 'ok';
  duplicateResult: DuplicateImportResult;
  warning: DuplicateImportWarning | null;
  reportType: string;
};

export async function analyzeSalesImportDuplicates(
  input: PrepareSalesImportReviewInput,
): Promise<AnalyzeSalesImportDuplicatesResult> {
  const { resolvedReview, reportType } = await prepareSalesImportResolvedReview(input);
  const duplicateResult = await detectDuplicateImportWithCandidateLookup(
    input.orgId,
    resolvedReview,
  );

  const needsConfirmation = duplicateResultNeedsUserConfirmation(duplicateResult);

  return {
    status: 'ok',
    duplicateResult,
    warning: needsConfirmation ? buildDuplicateImportWarning(duplicateResult) : null,
    reportType,
  };
}
