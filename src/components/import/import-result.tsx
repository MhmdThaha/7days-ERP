'use client';

import Link from 'next/link';
import { CheckCircle2, RotateCcw, TriangleAlert, XCircle } from 'lucide-react';

import type { CommitImportOutcome } from '@/actions/import';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ImportEntityType } from '@/lib/import/definitions';
import type { CommitRowResult } from '@/lib/import/services/commit.service';
import type { SaleImportCommitResult } from '@/lib/import/services/sale-import-commit.service';
import { cn } from '@/lib/utils';

type ImportResultProps = {
  entityType: ImportEntityType;
  outcome: CommitImportOutcome;
  /** Original uploaded file name. */
  fileName: string;
  /** Rows that were imported with warnings (from the analysis summary). */
  warningRows: number;
  /** Plural entity label, e.g. "Products". */
  entityLabel: string;
  /** Where "Return to …" navigates, e.g. /products. */
  returnHref: string;
  returnLabel: string;
  onImportAnother: () => void;
};

function formatDuration(durationMs: number): string {
  return durationMs < 1000 ? `${durationMs} ms` : `${(durationMs / 1000).toFixed(1)} s`;
}

function isSaleImportCommitResult(
  result: CommitImportOutcome['result'],
): result is SaleImportCommitResult {
  return 'saleIds' in result;
}

function ProductImportResult({
  outcome,
  fileName,
  warningRows,
  entityLabel,
  returnHref,
  returnLabel,
  onImportAnother,
}: ImportResultProps) {
  const { result, durationMs, strategy } = outcome;

  if (isSaleImportCommitResult(result)) {
    return null;
  }

  const updatedCount = 'updatedCount' in result ? result.updatedCount : 0;
  const skippedExistingCount =
    'skippedExistingCount' in result ? result.skippedExistingCount : 0;
  const skippedExactDuplicateCount =
    'skippedExactDuplicateCount' in result ? result.skippedExactDuplicateCount : 0;
  const savedCount = result.importedCount + updatedCount;
  const failedRows = result.rowResults.filter((row: CommitRowResult) => row.status === 'failed');

  const tone: 'success' | 'partial' | 'failure' =
    savedCount > 0 && result.failedCount === 0
      ? 'success'
      : savedCount > 0
        ? 'partial'
        : 'failure';

  const tiles = [
    { label: 'Created', value: result.importedCount, tone: 'text-success-foreground' },
    ...(updatedCount > 0
      ? [{ label: 'Updated', value: updatedCount, tone: 'text-success-foreground' as const }]
      : []),
    ...(skippedExistingCount > 0
      ? [
          {
            label: 'Skipped existing',
            value: skippedExistingCount,
            tone: 'text-muted-foreground' as const,
          },
        ]
      : []),
    ...(skippedExactDuplicateCount > 0
      ? [
          {
            label: 'Skipped exact duplicates',
            value: skippedExactDuplicateCount,
            tone: 'text-muted-foreground' as const,
          },
        ]
      : []),
    ...(result.skippedCount > 0
      ? [{ label: 'Skipped', value: result.skippedCount, tone: 'text-muted-foreground' as const }]
      : []),
    { label: 'Failed', value: result.failedCount, tone: 'text-destructive' },
    ...(warningRows > 0
      ? [{ label: 'Warnings', value: warningRows, tone: 'text-warning-foreground' as const }]
      : []),
  ];

  return (
    <div className="space-y-6">
      {tone === 'success' ? (
        <Alert variant="success">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>Import complete</AlertTitle>
          <AlertDescription>
            {savedCount.toLocaleString('en-IN')}{' '}
            {entityLabel.toLowerCase()} from {fileName} were saved to BakeryOS
            {updatedCount > 0
              ? ` (${result.importedCount.toLocaleString('en-IN')} new, ${updatedCount.toLocaleString('en-IN')} updated)`
              : ''}
            .
          </AlertDescription>
        </Alert>
      ) : tone === 'partial' ? (
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Import partially complete</AlertTitle>
          <AlertDescription>
            {savedCount.toLocaleString('en-IN')}{' '}
            {entityLabel.toLowerCase()} were saved, but{' '}
            {result.failedCount.toLocaleString('en-IN')} row
            {result.failedCount === 1 ? '' : 's'} could not be saved. Review the failed rows
            below and try importing them again.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <XCircle aria-hidden="true" />
          <AlertTitle>Import failed</AlertTitle>
          <AlertDescription>
            Nothing could be saved from {fileName}. Review the details below and try again —
            your data in BakeryOS was not changed.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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

          <p className="text-sm text-muted-foreground">
            Imported from <span className="font-medium text-foreground">{fileName}</span> in{' '}
            {formatDuration(durationMs)}
            {strategy === 'update-existing' ? ' (with updates)' : ''}.
          </p>
        </CardContent>
      </Card>

      {failedRows.length > 0 ? (
        <Card className="gap-0">
          <CardHeader className="pb-4">
            <CardTitle>Failed rows</CardTitle>
            <CardDescription>
              These rows could not be saved. Fix the file (or just keep these rows) and import
              it again — successfully imported rows should be removed first to avoid
              duplicates.
            </CardDescription>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24 text-right">Row</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="w-40">Document ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failedRows.map((row) => (
                  <TableRow key={row.rowNumber}>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {row.rowNumber}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {row.reason ?? 'Unknown error'}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {row.documentId ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      ) : null}

      <ImportResultActions
        returnHref={returnHref}
        returnLabel={returnLabel}
        onImportAnother={onImportAnother}
      />
    </div>
  );
}

function SaleImportResult({
  outcome,
  fileName,
  warningRows,
  entityLabel,
  returnHref,
  returnLabel,
  onImportAnother,
}: ImportResultProps) {
  const { result, durationMs } = outcome;

  if (!isSaleImportCommitResult(result)) {
    return null;
  }

  const savedCount = result.importedCount;
  const failedGroups = result.groupResults.filter((group) => group.status === 'failed');

  const tone: 'success' | 'partial' | 'failure' =
    savedCount > 0 && result.failedCount === 0
      ? 'success'
      : savedCount > 0
        ? 'partial'
        : 'failure';

  const tiles = [
    { label: 'Imported', value: result.importedCount, tone: 'text-success-foreground' },
    ...(result.skippedCount > 0
      ? [{ label: 'Skipped', value: result.skippedCount, tone: 'text-muted-foreground' as const }]
      : []),
    { label: 'Failed', value: result.failedCount, tone: 'text-destructive' },
    ...(warningRows > 0
      ? [{ label: 'Warnings', value: warningRows, tone: 'text-warning-foreground' as const }]
      : []),
  ];

  return (
    <div className="space-y-6">
      {tone === 'success' ? (
        <Alert variant="success">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>Import complete</AlertTitle>
          <AlertDescription>
            {savedCount.toLocaleString('en-IN')}{' '}
            {entityLabel.toLowerCase()} from {fileName} were saved to BakeryOS and inventory was
            updated.
          </AlertDescription>
        </Alert>
      ) : tone === 'partial' ? (
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Import partially complete</AlertTitle>
          <AlertDescription>
            {savedCount.toLocaleString('en-IN')}{' '}
            {entityLabel.toLowerCase()} were saved, but{' '}
            {result.failedCount.toLocaleString('en-IN')} sale
            {result.failedCount === 1 ? '' : 's'} could not be saved. Review the failed groups
            below and try importing them again.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <XCircle aria-hidden="true" />
          <AlertTitle>Import failed</AlertTitle>
          <AlertDescription>
            Nothing could be saved from {fileName}. Review the details below and try again —
            your data in BakeryOS was not changed.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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

          <p className="text-sm text-muted-foreground">
            Imported from <span className="font-medium text-foreground">{fileName}</span> in{' '}
            {formatDuration(durationMs)}.
          </p>
        </CardContent>
      </Card>

      {failedGroups.length > 0 ? (
        <Card className="gap-0">
          <CardHeader className="pb-4">
            <CardTitle>Failed sales</CardTitle>
            <CardDescription>
              These sale groups could not be saved. Fix the file and import again.
            </CardDescription>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Rows</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="w-40">Sale ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failedGroups.map((group) => (
                  <TableRow key={group.groupKey}>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {group.rowNumbers.join(', ')}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {group.reason ?? 'Unknown error'}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {group.saleId ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      ) : null}

      <ImportResultActions
        returnHref={returnHref}
        returnLabel={returnLabel}
        onImportAnother={onImportAnother}
      />
    </div>
  );
}

function ImportResultActions({
  returnHref,
  returnLabel,
  onImportAnother,
}: Pick<ImportResultProps, 'returnHref' | 'returnLabel' | 'onImportAnother'>) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="outline" onClick={onImportAnother}>
        <RotateCcw />
        Import another file
      </Button>
      <Button nativeButton={false} render={<Link href={returnHref} />}>
        {returnLabel}
      </Button>
    </div>
  );
}

/**
 * Final screen of the import wizard: what was saved, what was skipped,
 * what failed, and what to do next.
 */
export function ImportResult(props: ImportResultProps) {
  if (props.entityType === 'sale') {
    return <SaleImportResult {...props} />;
  }

  return <ProductImportResult {...props} />;
}
