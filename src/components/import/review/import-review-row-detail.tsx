'use client';

import { formatPreviewValue } from '@/components/import/preview-format';
import { ConfidenceMeter } from '@/components/import/review/confidence-meter';
import { Badge } from '@/components/ui/badge';
import { formatPreparedCustomerNameForReview } from '@/lib/import/preparation/sales-customer-semantics';
import { formatPreparedInvoiceNumberForReview } from '@/lib/import/preparation/sales-invoice-semantics';
import type { ImportReviewRowViewModel } from '@/lib/import/review/types';
import { getReviewProductMatchDisplay } from '@/lib/import/resolution';
import { AUTO_IMPORT_RECOMMENDATION } from '@/lib/import/services/confidence-engine.service';
import { IMPORT_CONFLICT_CODE } from '@/lib/import/services/conflict-engine.service';

const RECOMMENDATION_LABELS = {
  [AUTO_IMPORT_RECOMMENDATION.AUTO_IMPORT]: 'Auto import',
  [AUTO_IMPORT_RECOMMENDATION.PREVIEW_FIRST]: 'Preview first',
  [AUTO_IMPORT_RECOMMENDATION.USER_CONFIRMATION]: 'User confirmation',
  [AUTO_IMPORT_RECOMMENDATION.BLOCK_IMPORT]: 'Block import',
} as const;

type ImportReviewRowDetailProps = {
  row: ImportReviewRowViewModel;
};

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value instanceof Date) {
    return formatPreviewValue(value, 'date');
  }

  return String(value);
}

/** Expandable row panel — engine outputs only, no recomputation. */
export function ImportReviewRowDetail({ row }: ImportReviewRowDetailProps) {
  const { confidenceResult, conflictEngineResult, productMatchResult } = row;
  const productDisplay = getReviewProductMatchDisplay(row);

  return (
    <div className="space-y-4 bg-muted/20 p-4 text-sm">
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby={`original-${row.rowNumber}`}>
          <h4 id={`original-${row.rowNumber}`} className="mb-2 font-medium">
            Original values
          </h4>
          <dl className="space-y-1">
            {Object.entries(row.originalValues).map(([key, value]) => (
              <div key={key} className="grid grid-cols-[8rem_1fr] gap-2">
                <dt className="text-muted-foreground">{key}</dt>
                <dd className="break-words">{displayValue(value)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby={`normalized-${row.rowNumber}`}>
          <h4 id={`normalized-${row.rowNumber}`} className="mb-2 font-medium">
            Normalized values
          </h4>
          <dl className="space-y-1">
            {Object.entries(row.normalizedValues).map(([key, value]) => (
              <div key={key} className="grid grid-cols-[8rem_1fr] gap-2">
                <dt className="text-muted-foreground">{key}</dt>
                <dd className="break-words">
                  {key === 'customerName'
                    ? formatPreparedCustomerNameForReview(
                        value,
                        row.preparedFieldSources?.customerName === 'defaulted' ? 'defaulted' : undefined,
                      )
                    : key === 'saleNumber'
                      ? formatPreparedInvoiceNumberForReview(
                          value,
                          row.preparedFieldSources?.saleNumber === 'defaulted'
                            ? 'defaulted'
                            : row.preparedFieldSources?.saleNumber === 'imported'
                              ? 'imported'
                              : undefined,
                        )
                      : displayValue(value)}
                  {key === 'saleDate' && row.preparedFieldSources?.saleDate === 'user_entered' ? (
                    <span className="ml-2 text-xs text-muted-foreground">(Entered for this import)</span>
                  ) : null}
                  {key === 'sellingPrice' && row.preparedFieldSources?.sellingPrice === 'derived' ? (
                    <span className="ml-2 text-xs text-muted-foreground">(Calculated from line total)</span>
                  ) : null}
                  {key === 'amount' && row.preparedFieldSources?.amount === 'derived' ? (
                    <span className="ml-2 text-xs text-muted-foreground">(Calculated from unit price)</span>
                  ) : null}
                  {key === 'customerName' && row.preparedFieldSources?.customerName === 'defaulted' ? (
                    <span className="ml-2 text-xs text-muted-foreground">(defaulted)</span>
                  ) : null}
                  {key === 'saleNumber' && row.preparedFieldSources?.saleNumber === 'imported' ? (
                    <span className="ml-2 text-xs text-muted-foreground">(imported)</span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section aria-labelledby={`product-match-${row.rowNumber}`}>
        <h4 id={`product-match-${row.rowNumber}`} className="mb-2 font-medium">
          Product match
        </h4>
        {productMatchResult ? (
          <dl className="grid gap-1 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">{productDisplay.label}</dt>
              <dd>{productDisplay.value}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Match method</dt>
              <dd>{productMatchResult.reason}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Match confidence</dt>
              <dd className="tabular-nums">{productMatchResult.confidence}%</dd>
            </div>
          </dl>
        ) : (
          <p className="text-muted-foreground">No product match result.</p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby={`conflicts-${row.rowNumber}`}>
          <h4 id={`conflicts-${row.rowNumber}`} className="mb-2 font-medium">
            Conflicts
          </h4>
          {conflictEngineResult.conflicts.length === 0 ? (
            <p className="text-muted-foreground">No blocking conflicts.</p>
          ) : (
            <ul className="space-y-1">
              {conflictEngineResult.conflicts.map((entry) => (
                <li key={`${entry.code}-${entry.message}`}>
                  <Badge variant="destructive">{entry.code}</Badge>{' '}
                  <span>{entry.message}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby={`warnings-${row.rowNumber}`}>
          <h4 id={`warnings-${row.rowNumber}`} className="mb-2 font-medium">
            Warnings
          </h4>
          {conflictEngineResult.warnings.length === 0 ? (
            <p className="text-muted-foreground">No warnings.</p>
          ) : (
            <ul className="space-y-1">
              {conflictEngineResult.warnings.map((entry) => (
                <li key={`${entry.code}-${entry.message}`}>
                  <Badge variant="warning">{entry.code}</Badge>{' '}
                  <span>{entry.message}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby={`confidence-${row.rowNumber}`}>
        <h4 id={`confidence-${row.rowNumber}`} className="mb-2 font-medium">
          Confidence breakdown
        </h4>
        <ConfidenceMeter
          score={confidenceResult.confidenceScore}
          level={confidenceResult.confidenceLevel}
        />
        <p className="mt-2 text-muted-foreground">
          Penalty applied: {conflictEngineResult.confidencePenalty} points
        </p>
        {confidenceResult.confidenceReasons.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            {confidenceResult.confidenceReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
        <p className="mt-3">
          <span className="text-muted-foreground">Recommendation: </span>
          <Badge variant="outline">
            {RECOMMENDATION_LABELS[confidenceResult.autoImportRecommendation]}
          </Badge>
        </p>
        {conflictEngineResult.recommendedAction ? (
          <p className="mt-1 text-muted-foreground">{conflictEngineResult.recommendedAction}</p>
        ) : null}
      </section>
    </div>
  );
}

export function rowHasUnknownProduct(row: ImportReviewRowViewModel): boolean {
  return row.conflictEngineResult.conflicts.some(
    (entry) => entry.code === IMPORT_CONFLICT_CODE.UNKNOWN_PRODUCT,
  );
}

export function rowHasMultipleProducts(row: ImportReviewRowViewModel): boolean {
  return row.conflictEngineResult.conflicts.some(
    (entry) => entry.code === IMPORT_CONFLICT_CODE.MULTIPLE_PRODUCTS,
  );
}
