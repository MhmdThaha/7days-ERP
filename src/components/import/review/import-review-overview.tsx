'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ImportReviewOverviewViewModel } from '@/lib/import/review/types';
import { cn } from '@/lib/utils';

function formatReportConfidence(value: number): string {
  const percent = value <= 1 ? value * 100 : value;

  return `${Math.round(percent)}%`;
}

function formatHeaderRow(index: number): string {
  return index >= 0 ? `Row ${index + 1}` : 'Not detected';
}

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

type ImportReviewOverviewProps = {
  overview: ImportReviewOverviewViewModel;
};

/** Section 1 — file-level import readiness at a glance. */
export function ImportReviewOverview({ overview }: ImportReviewOverviewProps) {
  const canImport = overview.errorRows === 0;
  const tiles = [
    { label: 'Total rows', value: overview.totalRows, tone: 'text-foreground' },
    { label: 'Ready', value: overview.readyRows, tone: 'text-success-foreground' },
    { label: 'Warnings', value: overview.warningRows, tone: 'text-warning-foreground' },
    { label: 'Errors', value: overview.errorRows, tone: 'text-destructive' },
    { label: 'Avg confidence', value: `${Math.round(overview.averageConfidence)}%`, tone: 'text-foreground' },
    { label: 'Auto-import eligible', value: overview.autoImportEligibleRows, tone: 'text-foreground' },
    { label: 'Blocked', value: overview.blockedRows, tone: 'text-destructive' },
  ];

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-base">Import overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground uppercase tracking-wide">File name</dt>
            <dd className="font-medium break-all">{overview.fileName}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground uppercase tracking-wide">Detected report</dt>
            <dd className="font-medium">{overview.detectedReportName}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground uppercase tracking-wide">Report confidence</dt>
            <dd className="font-medium tabular-nums">{formatReportConfidence(overview.reportConfidence)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground uppercase tracking-wide">Header row</dt>
            <dd className="font-medium">{formatHeaderRow(overview.headerRowIndex)}</dd>
          </div>
        </dl>

        {overview.preparationSummary?.bulkSaleDateApplied ? (
          <p className="rounded-lg border border-info/30 bg-info/10 px-4 py-3 text-sm text-foreground">
            Sale date{' '}
            <span className="font-medium">
              {formatBulkSaleDate(overview.preparationSummary.bulkSaleDateApplied.value)}
            </span>{' '}
            will be applied to all {overview.preparationSummary.bulkSaleDateApplied.rowCount.toLocaleString('en-IN')}{' '}
            imported sales. Entered for this import.
          </p>
        ) : null}

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className="rounded-lg border bg-muted/25 p-3">
              <dt className="text-xs text-muted-foreground uppercase tracking-wide">{tile.label}</dt>
              <dd className={cn('text-2xl font-semibold tabular-nums', tile.tone)}>
                {typeof tile.value === 'number' ? tile.value.toLocaleString('en-IN') : tile.value}
              </dd>
            </div>
          ))}
        </dl>

        <p className="text-sm text-muted-foreground" aria-live="polite">
          {canImport ? (
            <>
              <span className="font-medium text-foreground">Yes</span> — this file can be imported after you review
              {overview.warningRows > 0 ? ` ${overview.warningRows.toLocaleString('en-IN')} warning row(s).` : '.'}
            </>
          ) : (
            <>
              <span className="font-medium text-destructive">Not yet</span> — fix{' '}
              {overview.errorRows.toLocaleString('en-IN')} error row(s) before importing.
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
