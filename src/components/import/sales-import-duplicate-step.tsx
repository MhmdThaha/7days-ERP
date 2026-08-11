'use client';

import { TriangleAlert } from 'lucide-react';

import {
  DUPLICATE_IMPORT_RECOMMENDATION,
  type DuplicateImportResult,
} from '@/lib/import/duplicate';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type SalesImportDuplicateStepProps = {
  duplicateResult: DuplicateImportResult;
  newSalesCount?: number;
  duplicateSalesCount?: number;
  onCancel: () => void;
  onImportAnyway: () => void;
  isBusy?: boolean;
};

export function SalesImportDuplicateStep({
  duplicateResult,
  newSalesCount = 0,
  duplicateSalesCount,
  onCancel,
  onImportAnyway,
  isBusy = false,
}: SalesImportDuplicateStepProps) {
  const isSkipDuplicates =
    duplicateResult.recommendation === DUPLICATE_IMPORT_RECOMMENDATION.SKIP_DUPLICATES;
  const skippedCount = duplicateSalesCount ?? duplicateResult.matchedRows;

  return (
    <div className="space-y-6">
      <Alert variant="warning">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>
          {isSkipDuplicates
            ? 'Some of these sales were already imported'
            : 'This file may have been imported before'}
        </AlertTitle>
        <AlertDescription>
          {isSkipDuplicates
            ? 'BakeryOS will skip duplicate sales and import only the new ones.'
            : 'BakeryOS found a possible duplicate import. Review the details below before continuing.'}
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="space-y-4 pt-6">
          {isSkipDuplicates ? (
            <>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Duplicate sales
                  </dt>
                  <dd className="text-lg font-semibold tabular-nums text-warning-foreground">
                    {skippedCount.toLocaleString('en-IN')} will be skipped
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    New sales
                  </dt>
                  <dd className="text-lg font-semibold tabular-nums text-success-foreground">
                    {newSalesCount.toLocaleString('en-IN')} ready to import
                  </dd>
                </div>
              </dl>
              <p className="text-sm text-muted-foreground">
                {skippedCount.toLocaleString('en-IN')} duplicate sale
                {skippedCount === 1 ? '' : 's'} will be skipped.{' '}
                {newSalesCount.toLocaleString('en-IN')} new sale
                {newSalesCount === 1 ? '' : 's'} are ready to import.
              </p>
            </>
          ) : (
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Confidence</dt>
                <dd className="text-lg font-semibold tabular-nums">{duplicateResult.confidence}%</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Matching rows</dt>
                <dd className="text-lg font-semibold tabular-nums">{duplicateResult.matchedRows}</dd>
              </div>
            </dl>
          )}

          {duplicateResult.duplicateReasons.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {duplicateResult.duplicateReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onCancel} disabled={isBusy}>
              Back to review
            </Button>
            <Button onClick={onImportAnyway} disabled={isBusy}>
              {isSkipDuplicates
                ? newSalesCount === 0
                  ? 'Done — nothing new to import'
                  : `Import ${newSalesCount.toLocaleString('en-IN')} New Sale${
                      newSalesCount === 1 ? '' : 's'
                    }`
                : 'Import anyway'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
