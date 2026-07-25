'use client';

import { useMemo } from 'react';
import {
  CheckCircle2,
  Copy,
  Database,
  Files,
  Hash,
  TriangleAlert,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { ImportEntityType } from '@/lib/import/definitions';
import { getImportUiCopy } from '@/lib/import/import-ui-copy';
import {
  isProductConflictDetectionResult,
  isSaleConflictDetectionResult,
  type ImportConflictDetectionOutcome,
} from '@/lib/import/services/import-entity-outcomes';
import type { ConflictDetectionResult } from '@/lib/import/services/conflict.service';
import type { SaleConflictDetectionResult } from '@/lib/import/services/sale-conflict.service';
import { cn } from '@/lib/utils';

type ConflictReviewProps = {
  entityType: ImportEntityType;
  conflicts: ImportConflictDetectionOutcome;
  /** Plural entity label, e.g. "Products". */
  entityLabel: string;
  onCancel: () => void;
  onImportNewOnly: () => void;
  onUpdateExisting: () => void;
  isCommitting: boolean;
};

/**
 * Conflict review screen. Dispatches to the entity-specific presentation while
 * sharing the same wizard shell.
 */
export function ConflictReview(props: ConflictReviewProps) {
  if (props.entityType === 'sale' && isSaleConflictDetectionResult(props.conflicts)) {
    return <SaleConflictReview {...props} conflicts={props.conflicts} />;
  }

  if (isProductConflictDetectionResult(props.conflicts)) {
    return <ProductConflictReview {...props} conflicts={props.conflicts} />;
  }

  return null;
}

type ProductConflictReviewProps = Omit<ConflictReviewProps, 'conflicts'> & {
  conflicts: ConflictDetectionResult;
};

type SaleConflictReviewProps = Omit<ConflictReviewProps, 'conflicts'> & {
  conflicts: SaleConflictDetectionResult;
};

/** Unique display names for conflicting duplicates, preserving first-seen casing. */
function uniqueConflictingDuplicateNames(conflicts: ConflictDetectionResult): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const entry of conflicts.duplicateRowsInFile) {
    if (seen.has(entry.normalizedName)) {
      continue;
    }

    seen.add(entry.normalizedName);
    names.push(entry.name);
  }

  return names;
}

/** Unique display names for exact duplicates, preserving first-seen casing. */
function uniqueExactDuplicateNames(conflicts: ConflictDetectionResult): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const entry of conflicts.exactDuplicateRows) {
    if (seen.has(entry.normalizedName)) {
      continue;
    }

    seen.add(entry.normalizedName);
    names.push(entry.name);
  }

  return names;
}

/** Unique existing-product names from the conflict result. */
function uniqueExistingNames(conflicts: ConflictDetectionResult): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const entry of conflicts.existingProducts) {
    if (seen.has(entry.normalizedName)) {
      continue;
    }

    seen.add(entry.normalizedName);
    names.push(entry.existingProduct.name);
  }

  return names;
}

/**
 * Product import conflict review.
 */
function ProductConflictReview({
  conflicts,
  entityLabel,
  onCancel,
  onImportNewOnly,
  onUpdateExisting,
  isCommitting,
}: ProductConflictReviewProps) {
  const { summary } = conflicts;
  const hasDuplicateProductCodes = summary.duplicateProductCodeCount > 0;
  const hasConflictingDuplicates = summary.conflictingDuplicateRowCount > 0;
  const hasExactDuplicates = summary.exactDuplicateRowCount > 0;
  const hasExisting = summary.existingProductNameCount > 0;
  const hasBlockingConflicts =
    hasDuplicateProductCodes || hasConflictingDuplicates || hasExisting;

  const conflictingDuplicateNames = useMemo(
    () => uniqueConflictingDuplicateNames(conflicts),
    [conflicts],
  );
  const exactDuplicateNames = useMemo(
    () => uniqueExactDuplicateNames(conflicts),
    [conflicts],
  );
  const existingNames = useMemo(
    () => uniqueExistingNames(conflicts),
    [conflicts],
  );

  const tiles = [
    {
      label: 'Products checked',
      value: summary.totalChecked,
      tone: 'text-foreground',
    },
    {
      label: 'Exact duplicates',
      value: summary.exactDuplicateRowCount,
      tone: hasExactDuplicates ? 'text-muted-foreground' : 'text-foreground',
    },
    {
      label: 'Conflicting duplicates',
      value: summary.conflictingDuplicateRowCount,
      tone: hasConflictingDuplicates ? 'text-destructive' : 'text-foreground',
    },
    {
      label: 'Existing products',
      value: summary.existingProductNameCount,
      tone: hasExisting ? 'text-warning-foreground' : 'text-foreground',
    },
    {
      label: 'Duplicate codes',
      value: summary.duplicateProductCodeCount,
      tone: hasDuplicateProductCodes ? 'text-destructive' : 'text-foreground',
    },
    {
      label: 'Ready to import',
      value: summary.cleanRowCount,
      tone: 'text-success-foreground',
    },
  ];

  const canImportNew = summary.cleanRowCount > 0 && !hasDuplicateProductCodes;
  const canUpdateExisting =
    !hasDuplicateProductCodes &&
    (summary.cleanRowCount > 0 ||
      summary.existingProductNameCount > 0 ||
      summary.conflictingDuplicateNameCount > 0);

  return (
    <div className="space-y-6">
      {hasDuplicateProductCodes ? (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Duplicate product codes found</AlertTitle>
          <AlertDescription>
            Please fix your Excel before importing. Product codes must be unique in
            the file and in BakeryOS.
          </AlertDescription>
        </Alert>
      ) : hasBlockingConflicts ? (
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Conflicts need your attention</AlertTitle>
          <AlertDescription>
            Review the conflicts below before continuing. Nothing has been imported
            yet.
          </AlertDescription>
        </Alert>
      ) : hasExactDuplicates ? (
        <Alert variant="success">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>Ready to import</AlertTitle>
          <AlertDescription>
            {summary.exactDuplicateRowCount.toLocaleString('en-IN')} exact duplicate row
            {summary.exactDuplicateRowCount === 1 ? '' : 's'} will be skipped
            automatically. No manual cleanup is needed.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="success">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>No conflicts detected</AlertTitle>
          <AlertDescription>
            Ready to import. All checked {entityLabel.toLowerCase()} are new and
            unique.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Import summary</CardTitle>
          <CardDescription>
            How the file compares to products already in BakeryOS.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      {hasDuplicateProductCodes ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Hash className="size-4 text-destructive" aria-hidden="true" />
              <CardTitle>Duplicate product codes</CardTitle>
              <Badge variant="destructive">{conflicts.duplicateProductCodes.length}</Badge>
            </div>
            <CardDescription>
              Please fix your Excel before importing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {conflicts.duplicateProductCodes.map((entry) => (
              <div
                key={entry.normalizedCode}
                className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Duplicate product code
                </p>
                <p className="mt-1 font-mono text-lg font-semibold">{entry.code}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Rows:{' '}
                  <span className="font-medium tabular-nums text-foreground">
                    {entry.rowNumbers.join(', ')}
                  </span>
                </p>
                {entry.existingProduct ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Already used by{' '}
                    <span className="font-medium text-foreground">
                      {entry.existingProduct.name}
                    </span>{' '}
                    in BakeryOS.
                  </p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {hasExactDuplicates ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Files className="size-4 text-muted-foreground" aria-hidden="true" />
              <CardTitle>Exact duplicates</CardTitle>
              <Badge variant="secondary">{exactDuplicateNames.length}</Badge>
              <Badge variant="outline">Automatically skipped</Badge>
            </div>
            <CardDescription>
              These rows repeat the same product data as an earlier row. The first
              occurrence will be imported; the rest are skipped automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2" aria-label="Exact duplicate product names">
              {exactDuplicateNames.map((name) => (
                <li
                  key={name}
                  className="flex items-center gap-2 rounded-lg border bg-muted/25 px-3 py-2 text-sm font-medium"
                >
                  <span className="text-muted-foreground" aria-hidden="true">
                    •
                  </span>
                  {name}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {hasConflictingDuplicates ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Copy className="size-4 text-destructive" aria-hidden="true" />
              <CardTitle>Conflicting duplicates</CardTitle>
              <Badge variant="destructive">{conflictingDuplicateNames.length}</Badge>
              <Badge variant="destructive">Requires resolution</Badge>
            </div>
            <CardDescription>
              These product names appear more than once with different data. Fix the
              spreadsheet and re-import before continuing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2" aria-label="Conflicting duplicate product names">
              {conflictingDuplicateNames.map((name) => (
                <li
                  key={name}
                  className="flex items-center gap-2 rounded-lg border bg-muted/25 px-3 py-2 text-sm font-medium"
                >
                  <span className="text-muted-foreground" aria-hidden="true">
                    •
                  </span>
                  {name}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {hasExisting ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="size-4 text-warning-foreground" aria-hidden="true" />
              <CardTitle>Existing products</CardTitle>
              <Badge variant="warning">{existingNames.length}</Badge>
            </div>
            <CardDescription>
              These products already exist in BakeryOS. Choose whether to skip them or
              update them in a later step.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2" aria-label="Existing product names">
              {existingNames.map((name) => (
                <li
                  key={name}
                  className="flex items-center gap-2 rounded-lg border bg-muted/25 px-3 py-2 text-sm font-medium"
                >
                  <span className="text-muted-foreground" aria-hidden="true">
                    •
                  </span>
                  {name}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {!hasBlockingConflicts && !hasExactDuplicates ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
            <CheckCircle2 className="size-8 text-success-foreground" aria-hidden="true" />
            <p className="font-medium">No conflicts detected.</p>
            <p className="text-sm text-muted-foreground">Ready to import.</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {isCommitting
              ? `Importing ${entityLabel.toLowerCase()}… Please wait and keep this page open.`
              : hasDuplicateProductCodes
                ? 'Import is blocked until duplicate product codes are fixed in your Excel file.'
                : hasBlockingConflicts
                ? 'Choose how to handle the conflicts below. Nothing has been saved yet.'
                : 'All products are ready. Choose an import action to continue.'}
          </p>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Button variant="outline" onClick={onCancel} disabled={isCommitting}>
              Cancel
            </Button>
            <Button
              variant="outline"
              disabled={!canUpdateExisting || isCommitting}
              onClick={onUpdateExisting}
            >
              {getImportUiCopy('product').updateExistingLabel}
            </Button>
            <Button
              disabled={!canImportNew || isCommitting}
              onClick={onImportNewOnly}
            >
              {getImportUiCopy('product').importNewOnlyLabel}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function saleDisplayLabel(saleNumber: string | null, groupKey: string): string {
  return saleNumber?.trim() ? saleNumber : groupKey;
}

function uniqueExactDuplicateSaleLabels(conflicts: SaleConflictDetectionResult): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];

  for (const entry of conflicts.exactDuplicateSales) {
    const label = saleDisplayLabel(entry.saleNumber, entry.groupKey);

    if (seen.has(label)) {
      continue;
    }

    seen.add(label);
    labels.push(label);
  }

  return labels;
}

function uniqueConflictingDuplicateSaleLabels(conflicts: SaleConflictDetectionResult): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];

  for (const entry of conflicts.conflictingDuplicateSales) {
    const label = entry.saleNumber;

    if (seen.has(label)) {
      continue;
    }

    seen.add(label);
    labels.push(label);
  }

  return labels;
}

function uniqueExistingSaleLabels(conflicts: SaleConflictDetectionResult): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];

  for (const entry of conflicts.existingSales) {
    const label = entry.saleNumber;

    if (seen.has(label)) {
      continue;
    }

    seen.add(label);
    labels.push(label);
  }

  return labels;
}

/** Sale import conflict review. */
function SaleConflictReview({
  conflicts,
  entityLabel,
  entityType,
  onCancel,
  onImportNewOnly,
  isCommitting,
}: SaleConflictReviewProps) {
  const { summary } = conflicts;
  const uiCopy = getImportUiCopy(entityType);
  const hasConflictingDuplicates = summary.conflictingDuplicateGroupCount > 0;
  const hasExactDuplicates = summary.exactDuplicateGroupCount > 0;
  const hasExisting = summary.existingSaleCount > 0;
  const hasLineErrors = summary.lineErrorGroupCount > 0;
  const hasGroupIssues = summary.groupIssueGroupCount > 0;
  const hasBlockingConflicts =
    hasConflictingDuplicates || hasExisting || hasLineErrors || hasGroupIssues;

  const exactDuplicateLabels = useMemo(
    () => uniqueExactDuplicateSaleLabels(conflicts),
    [conflicts],
  );
  const conflictingDuplicateLabels = useMemo(
    () => uniqueConflictingDuplicateSaleLabels(conflicts),
    [conflicts],
  );
  const existingSaleLabels = useMemo(
    () => uniqueExistingSaleLabels(conflicts),
    [conflicts],
  );

  const tiles = [
    {
      label: 'Sales checked',
      value: summary.totalChecked,
      tone: 'text-foreground',
    },
    {
      label: 'Exact duplicates',
      value: summary.exactDuplicateGroupCount,
      tone: hasExactDuplicates ? 'text-muted-foreground' : 'text-foreground',
    },
    {
      label: 'Conflicting duplicates',
      value: summary.conflictingDuplicateGroupCount,
      tone: hasConflictingDuplicates ? 'text-destructive' : 'text-foreground',
    },
    {
      label: 'Existing sales',
      value: summary.existingSaleCount,
      tone: hasExisting ? 'text-warning-foreground' : 'text-foreground',
    },
    {
      label: 'Line errors',
      value: summary.lineErrorGroupCount,
      tone: hasLineErrors ? 'text-destructive' : 'text-foreground',
    },
    {
      label: 'Ready to import',
      value: summary.cleanGroupCount,
      tone: 'text-success-foreground',
    },
  ];

  const canImportNew = summary.cleanGroupCount > 0 && !hasConflictingDuplicates;

  return (
    <div className="space-y-6">
      {hasBlockingConflicts ? (
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Conflicts need your attention</AlertTitle>
          <AlertDescription>
            Review the conflicts below before continuing. Nothing has been imported yet.
          </AlertDescription>
        </Alert>
      ) : hasExactDuplicates ? (
        <Alert variant="success">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>Ready to import</AlertTitle>
          <AlertDescription>
            {summary.exactDuplicateGroupCount.toLocaleString('en-IN')} exact duplicate sale
            {summary.exactDuplicateGroupCount === 1 ? '' : 's'} will be skipped automatically.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="success">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>No conflicts detected</AlertTitle>
          <AlertDescription>
            Ready to import. All checked {entityLabel.toLowerCase()} are new and unique.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Import summary</CardTitle>
          <CardDescription>
            How the file compares to sales already in BakeryOS.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
        </CardContent>
      </Card>

      {hasExactDuplicates ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Files className="size-4 text-muted-foreground" aria-hidden="true" />
              <CardTitle>Exact duplicates</CardTitle>
              <Badge variant="secondary">{exactDuplicateLabels.length}</Badge>
              <Badge variant="outline">Automatically skipped</Badge>
            </div>
            <CardDescription>
              These sales repeat the same data as an earlier group. The first occurrence will
              be imported; the rest are skipped automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2" aria-label="Exact duplicate sale numbers">
              {exactDuplicateLabels.map((label) => (
                <li
                  key={label}
                  className="flex items-center gap-2 rounded-lg border bg-muted/25 px-3 py-2 text-sm font-medium"
                >
                  <span className="text-muted-foreground" aria-hidden="true">
                    •
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {hasConflictingDuplicates ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Copy className="size-4 text-destructive" aria-hidden="true" />
              <CardTitle>Conflicting duplicates</CardTitle>
              <Badge variant="destructive">{conflictingDuplicateLabels.length}</Badge>
              <Badge variant="destructive">Requires resolution</Badge>
            </div>
            <CardDescription>
              These sale numbers appear more than once with different data. Fix the spreadsheet
              and re-import before continuing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2" aria-label="Conflicting duplicate sale numbers">
              {conflictingDuplicateLabels.map((label) => (
                <li
                  key={label}
                  className="flex items-center gap-2 rounded-lg border bg-muted/25 px-3 py-2 text-sm font-medium"
                >
                  <span className="text-muted-foreground" aria-hidden="true">
                    •
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {hasExisting ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="size-4 text-warning-foreground" aria-hidden="true" />
              <CardTitle>Existing sales</CardTitle>
              <Badge variant="warning">{existingSaleLabels.length}</Badge>
            </div>
            <CardDescription>
              These sale numbers already exist in BakeryOS and will not be imported again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2" aria-label="Existing sale numbers">
              {existingSaleLabels.map((label) => (
                <li
                  key={label}
                  className="flex items-center gap-2 rounded-lg border bg-muted/25 px-3 py-2 text-sm font-medium"
                >
                  <span className="text-muted-foreground" aria-hidden="true">
                    •
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {!hasBlockingConflicts && !hasExactDuplicates ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
            <CheckCircle2 className="size-8 text-success-foreground" aria-hidden="true" />
            <p className="font-medium">No conflicts detected.</p>
            <p className="text-sm text-muted-foreground">Ready to import.</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {isCommitting
              ? `Importing ${entityLabel.toLowerCase()}… Please wait and keep this page open.`
              : hasBlockingConflicts
                ? 'Resolve the conflicts below or import only the clean sales. Nothing has been saved yet.'
                : 'All clean sales are ready. Choose an import action to continue.'}
          </p>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Button variant="outline" onClick={onCancel} disabled={isCommitting}>
              Cancel
            </Button>
            <Button disabled={!canImportNew || isCommitting} onClick={onImportNewOnly}>
              {uiCopy.importNewOnlyLabel}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
