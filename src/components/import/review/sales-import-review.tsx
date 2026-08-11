'use client';

import { CheckCircle2, ChevronDown, ChevronRight, TriangleAlert, XCircle } from 'lucide-react';
import { useState, type ReactNode, type RefObject } from 'react';

import { ImportReviewRowDetail } from '@/components/import/review/import-review-row-detail';
import {
  formatReviewCustomer,
  formatReviewProductName,
  formatReviewQuantityAmount,
  formatReviewSaleDate,
} from '@/components/import/review/sales-import-review-format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getProductResolutionActionLabel,
  getReviewProductMatchDisplay,
} from '@/lib/import/resolution';
import type { ImportReviewViewModel } from '@/lib/import/review/types';
import type { ImportReviewRowViewModel } from '@/lib/import/review/types';
import {
  computeImportReviewSummary,
  countUnresolvedIssues,
  getOwnerFacingAttentionMessage,
  getOwnerFacingErrorMessage,
  getOwnerFacingRowStatus,
  partitionImportReviewRows,
  type ImportReviewSummary,
} from '@/lib/import/review/import-review-buckets';
import { cn } from '@/lib/utils';

type SalesImportReviewProps = {
  viewModel: ImportReviewViewModel;
  onResolve: (row: ImportReviewRowViewModel) => void;
  needsResolution: (row: ImportReviewRowViewModel) => boolean;
  isReadOnly: (row: ImportReviewRowViewModel) => boolean;
  issuesSectionRef?: RefObject<HTMLDivElement | null>;
  /** Primary/secondary actions placed after the summary, before row sections. */
  actions?: ReactNode;
};

function formatBulkSaleDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);

  if (!year || !month || !day) {
    return isoDate;
  }

  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function SalesImportReviewSummaryBar({ summary }: { summary: ImportReviewSummary }) {
  return (
    <Card>
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-lg">Import Review</CardTitle>
        <p className="text-sm text-muted-foreground">
          {summary.total.toLocaleString('en-IN')} sales found
        </p>
      </CardHeader>
      <CardContent className="grid gap-3 pt-4 sm:grid-cols-3">
        <SummaryCount
          icon={CheckCircle2}
          tone="text-success-foreground"
          label="Ready to import"
          value={summary.ready}
        />
        <SummaryCount
          icon={TriangleAlert}
          tone="text-warning-foreground"
          label="Need your attention"
          value={summary.needsAttention}
        />
        <SummaryCount
          icon={XCircle}
          tone="text-destructive"
          label="Cannot import yet"
          value={summary.errors}
        />
      </CardContent>
    </Card>
  );
}

function SummaryCount({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: typeof CheckCircle2;
  tone: string;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className={cn('flex items-center gap-2 text-sm font-medium', tone)}>
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span>
          {value.toLocaleString('en-IN')} {label}
        </span>
      </div>
    </div>
  );
}

function OwnerStatusBadge({ row }: { row: ImportReviewRowViewModel }) {
  const status = getOwnerFacingRowStatus(row);
  const variant =
    status.bucket === 'ready' ? 'success' : status.bucket === 'needs-attention' ? 'warning' : 'destructive';

  return <Badge variant={variant}>{status.label}</Badge>;
}

function ReadySaleCard({ row }: { row: ImportReviewRowViewModel }) {
  const [expanded, setExpanded] = useState(false);
  const productDisplay = getReviewProductMatchDisplay(row);

  return (
    <article className="rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="font-medium">{formatReviewProductName(row)}</p>
          <p className="text-sm text-muted-foreground">{formatReviewQuantityAmount(row)}</p>
          <p className="text-sm">{formatReviewCustomer(row)}</p>
          <p className="text-sm text-muted-foreground">{formatReviewSaleDate(row)}</p>
          {productDisplay.kind === 'matched' ? (
            <p className="text-xs text-muted-foreground">BakeryOS product: {productDisplay.value}</p>
          ) : null}
        </div>
        <OwnerStatusBadge row={row} />
      </div>
      <div className="mt-3">
        <Button variant="ghost" size="sm" onClick={() => setExpanded((current) => !current)}>
          {expanded ? <ChevronDown /> : <ChevronRight />}
          View details
        </Button>
        {expanded ? (
          <div className="mt-2">
            <ImportReviewRowDetail row={row} />
          </div>
        ) : null}
      </div>
    </article>
  );
}

function AttentionSaleCard({
  row,
  onResolve,
  needsResolution,
  isReadOnly,
}: {
  row: ImportReviewRowViewModel;
  onResolve: (row: ImportReviewRowViewModel) => void;
  needsResolution: (row: ImportReviewRowViewModel) => boolean;
  isReadOnly: (row: ImportReviewRowViewModel) => boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const message = getOwnerFacingAttentionMessage(row);

  return (
    <article className="rounded-lg border border-warning/30 bg-warning/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="font-medium">{formatReviewProductName(row)}</p>
          <p className="text-sm text-muted-foreground">{formatReviewQuantityAmount(row)}</p>
          {message ? <p className="text-sm">{message}</p> : null}
        </div>
        <OwnerStatusBadge row={row} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {needsResolution(row) || isReadOnly(row) ? (
          <Button variant="outline" size="sm" onClick={() => onResolve(row)}>
            {isReadOnly(row) ? 'View issue' : getProductResolutionActionLabel(row)}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={() => setExpanded((current) => !current)}>
          {expanded ? <ChevronDown /> : <ChevronRight />}
          View details
        </Button>
      </div>
      {expanded ? (
        <div className="mt-2">
          <ImportReviewRowDetail row={row} />
        </div>
      ) : null}
    </article>
  );
}

function ErrorSaleCard({
  row,
  onResolve,
  needsResolution,
  isReadOnly,
}: {
  row: ImportReviewRowViewModel;
  onResolve: (row: ImportReviewRowViewModel) => void;
  needsResolution: (row: ImportReviewRowViewModel) => boolean;
  isReadOnly: (row: ImportReviewRowViewModel) => boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const message = getOwnerFacingErrorMessage(row);

  return (
    <article className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="font-medium">{formatReviewProductName(row)}</p>
          <p className="text-sm text-destructive">{message}</p>
        </div>
        <OwnerStatusBadge row={row} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {needsResolution(row) || isReadOnly(row) ? (
          <Button variant="outline" size="sm" onClick={() => onResolve(row)}>
            {isReadOnly(row) ? 'View issue' : getProductResolutionActionLabel(row)}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={() => setExpanded((current) => !current)}>
          {expanded ? <ChevronDown /> : <ChevronRight />}
          View details
        </Button>
      </div>
      {expanded ? (
        <div className="mt-2">
          <ImportReviewRowDetail row={row} />
        </div>
      ) : null}
    </article>
  );
}

export function SalesImportReview({
  viewModel,
  onResolve,
  needsResolution,
  isReadOnly,
  issuesSectionRef,
  actions,
}: SalesImportReviewProps) {
  const summary = computeImportReviewSummary(viewModel.rows);
  const { ready, needsAttention, errors } = partitionImportReviewRows(viewModel.rows);
  const issueCount = countUnresolvedIssues(summary);
  const bulkDate = viewModel.overview.preparationSummary?.bulkSaleDateApplied;

  return (
    <div className="space-y-6">
      <SalesImportReviewSummaryBar summary={summary} />

      {bulkDate ? (
        <p className="rounded-lg border border-info/30 bg-info/10 px-4 py-3 text-sm">
          Sale date <span className="font-medium">{formatBulkSaleDate(bulkDate.value)}</span> will
          be used for imported sales in this file.
        </p>
      ) : null}

      {summary.importableCount > 0 && issueCount > 0 ? (
        <p className="text-sm text-muted-foreground">
          {summary.importableCount.toLocaleString('en-IN')} sales are ready.{' '}
          {issueCount.toLocaleString('en-IN')} need attention and will not be imported until
          resolved.
        </p>
      ) : null}

      {actions}

      {ready.length > 0 ? (
        <section aria-labelledby="ready-sales-heading">
          <h2 id="ready-sales-heading" className="mb-1 text-base font-semibold">
            Ready to import
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            {ready.length.toLocaleString('en-IN')} sales can be imported safely.
          </p>
          <div className="space-y-3">
            {ready.map((row) => (
              <ReadySaleCard key={row.rowNumber} row={row} />
            ))}
          </div>
        </section>
      ) : null}

      <div ref={issuesSectionRef}>
        {needsAttention.length > 0 ? (
          <section aria-labelledby="attention-sales-heading" className="space-y-3">
            <h2 id="attention-sales-heading" className="text-base font-semibold">
              Needs your attention
            </h2>
            <p className="text-sm text-muted-foreground">
              These sales need a quick decision before they can be imported.
            </p>
            {needsAttention.map((row) => (
              <AttentionSaleCard
                key={row.rowNumber}
                row={row}
                onResolve={onResolve}
                needsResolution={needsResolution}
                isReadOnly={isReadOnly}
              />
            ))}
          </section>
        ) : null}

        {errors.length > 0 ? (
          <section
            aria-labelledby="error-sales-heading"
            className={cn('space-y-3', needsAttention.length > 0 && 'mt-6')}
          >
            <h2 id="error-sales-heading" className="text-base font-semibold">
              Cannot import yet
            </h2>
            <p className="text-sm text-muted-foreground">
              Fix these problems before they can be imported.
            </p>
            {errors.map((row) => (
              <ErrorSaleCard
                key={row.rowNumber}
                row={row}
                onResolve={onResolve}
                needsResolution={needsResolution}
                isReadOnly={isReadOnly}
              />
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}

export { computeImportReviewSummary, countUnresolvedIssues };
