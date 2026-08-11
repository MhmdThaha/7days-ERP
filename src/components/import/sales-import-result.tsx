'use client';

import Link from 'next/link';
import { CheckCircle2, RotateCcw, TriangleAlert, XCircle } from 'lucide-react';

import type { SalesImportCommitOutcome } from '@/types/import';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

type SalesImportResultProps = {
  outcome: SalesImportCommitOutcome;
  returnHref: string;
  returnLabel: string;
  onImportAnother: () => void;
  remainingUnresolvedCount?: number;
  onReviewRemaining?: () => void;
};

function formatDuration(durationMs: number): string {
  return durationMs < 1000 ? `${durationMs} ms` : `${(durationMs / 1000).toFixed(1)} s`;
}

export function SalesImportResult({
  outcome,
  returnHref,
  returnLabel,
  onImportAnother,
  remainingUnresolvedCount = 0,
  onReviewRemaining,
}: SalesImportResultProps) {
  const importedRows = outcome.execution?.imported ?? 0;
  const skippedRows = outcome.execution?.skipped ?? 0;
  const failedRows = outcome.execution?.failed ?? 0;
  const completedSales = outcome.finalization?.completedSales ?? 0;
  const failedFinalizations = outcome.finalization?.failedSales ?? 0;
  const rowFailures =
    outcome.execution?.rowResults.filter((entry) => entry.status === 'failed') ?? [];
  const finalizationFailures =
    outcome.finalization?.outcomes.filter((entry) => entry.status === 'failed') ?? [];
  const remainingCount = Math.max(remainingUnresolvedCount, skippedRows);

  const tone: 'success' | 'partial' | 'failure' =
    outcome.status === 'success'
      ? 'success'
      : outcome.status === 'partial'
        ? 'partial'
        : 'failure';

  const tiles = [
    { label: 'Sales imported', value: importedRows, tone: 'text-success-foreground' },
    ...(remainingCount > 0
      ? [{ label: 'Still need attention', value: remainingCount, tone: 'text-warning-foreground' as const }]
      : []),
    { label: 'Sales completed', value: completedSales, tone: 'text-success-foreground' },
    ...(failedRows > 0
      ? [{ label: 'Row failures', value: failedRows, tone: 'text-destructive' as const }]
      : []),
    ...(failedFinalizations > 0
      ? [
          {
            label: 'Completion failures',
            value: failedFinalizations,
            tone: 'text-destructive' as const,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      {tone === 'success' ? (
        <Alert variant="success">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>Import complete</AlertTitle>
          <AlertDescription>
            {importedRows.toLocaleString('en-IN')} sale
            {importedRows === 1 ? '' : 's'} imported successfully from {outcome.fileName}.
            {remainingCount > 0
              ? ` ${remainingCount.toLocaleString('en-IN')} sale${remainingCount === 1 ? '' : 's'} still need attention.`
              : ' Inventory was updated and today\'s summary was refreshed.'}
          </AlertDescription>
        </Alert>
      ) : tone === 'partial' ? (
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Import partially complete</AlertTitle>
          <AlertDescription>
            {importedRows.toLocaleString('en-IN')} sale{importedRows === 1 ? '' : 's'} imported
            successfully.
            {remainingCount > 0
              ? ` ${remainingCount.toLocaleString('en-IN')} sale${remainingCount === 1 ? '' : 's'} still need attention.`
              : ' Some sales still need attention.'}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <XCircle aria-hidden="true" />
          <AlertTitle>Import failed</AlertTitle>
          <AlertDescription>
            The sales import could not be completed. Review the details below and try again.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="space-y-4 pt-6">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {tiles.map((tile) => (
              <div key={tile.label} className="rounded-lg border bg-muted/25 p-3">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  {tile.label}
                </dt>
                <dd className={cn('text-2xl font-semibold tabular-nums', tile.tone)}>
                  {tile.value.toLocaleString('en-IN')}
                </dd>
              </div>
            ))}
          </dl>

          <p className="text-sm text-muted-foreground">
            Imported from <span className="font-medium text-foreground">{outcome.fileName}</span> in{' '}
            {formatDuration(outcome.durationMs)}.
          </p>
        </CardContent>
      </Card>

      {rowFailures.length > 0 ? (
        <FailureTable
          title="Failed rows"
          description="These rows could not create draft sales."
          rows={rowFailures.map((entry) => ({
            key: String(entry.rowNumber),
            primary: `Row ${entry.rowNumber}`,
            reason: entry.reason ?? 'Unknown error',
          }))}
        />
      ) : null}

      {finalizationFailures.length > 0 ? (
        <FailureTable
          title="Sales not completed"
          description="Draft sales were created but inventory could not be updated for these sales."
          rows={finalizationFailures.map((entry) => ({
            key: entry.saleId,
            primary: entry.saleId,
            reason: entry.reason ?? 'Unknown error',
          }))}
        />
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onImportAnother}>
          <RotateCcw />
          Import another file
        </Button>
        {remainingCount > 0 && onReviewRemaining ? (
          <Button variant="secondary" onClick={onReviewRemaining}>
            Review Remaining {remainingCount.toLocaleString('en-IN')}
          </Button>
        ) : null}
        <Button nativeButton={false} render={<Link href={returnHref} />}>
          {returnLabel}
        </Button>
      </div>
    </div>
  );
}

function FailureTable({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: readonly { key: string; primary: string; reason: string }[];
}) {
  return (
    <Card className="gap-0">
      <CardContent className="space-y-4 pt-6">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Item</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="text-muted-foreground">{row.primary}</TableCell>
                  <TableCell className="whitespace-normal">{row.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
