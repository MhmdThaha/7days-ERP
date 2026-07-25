'use client';

import { Card, CardContent } from '@/components/ui/card';
import type { ImportRunReport } from '@/lib/import/services/import.service';
import { cn } from '@/lib/utils';

type ImportSummaryProps = {
  report: ImportRunReport;
  /** Plural entity label, e.g. "Products". */
  entityLabel: string;
};

/** Top-line numbers: what was read and what will happen on import. */
export function ImportSummary({ report, entityLabel }: ImportSummaryProps) {
  const { summary } = report.result;
  const importable = summary.validRows + summary.warningRows;

  const tiles = [
    { label: 'Total rows', value: summary.totalRows, tone: 'text-foreground' },
    { label: 'Ready', value: summary.validRows, tone: 'text-success-foreground' },
    { label: 'Warnings', value: summary.warningRows, tone: 'text-warning-foreground' },
    { label: 'Errors', value: summary.errorRows, tone: 'text-destructive' },
  ];

  return (
    <Card>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className="rounded-lg border bg-muted/25 p-3">
              <dt className="text-xs text-muted-foreground uppercase tracking-wide">
                {tile.label}
              </dt>
              <dd className={cn('text-2xl font-semibold tabular-nums', tile.tone)}>
                {tile.value.toLocaleString('en-IN')}
              </dd>
            </div>
          ))}
        </dl>

        <p className="text-sm text-muted-foreground" aria-live="polite">
          <span className="font-medium text-foreground">
            {importable.toLocaleString('en-IN')}
          </span>{' '}
          {entityLabel.toLowerCase()} will be imported
          {summary.errorRows > 0 ? (
            <>
              {' '}
              and{' '}
              <span className="font-medium text-destructive">
                {summary.errorRows.toLocaleString('en-IN')}
              </span>{' '}
              row{summary.errorRows === 1 ? '' : 's'} with errors will be skipped
            </>
          ) : null}
          {report.skippedEmptyRowCount > 0
            ? ` (${report.skippedEmptyRowCount} empty row${report.skippedEmptyRowCount === 1 ? ' was' : 's were'} ignored)`
            : null}
          .
        </p>
      </CardContent>
    </Card>
  );
}
