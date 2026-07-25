'use client';

import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  FileX2,
  Import,
  Loader2,
  RotateCcw,
  TriangleAlert,
} from 'lucide-react';

import { ImportGuidancePanel } from '@/components/import/import-guidance';
import { ImportSummary } from '@/components/import/import-summary';
import { MappingSummary } from '@/components/import/mapping-summary';
import { PreviewTable } from '@/components/import/preview-table';
import { RowDetailsDrawer } from '@/components/import/row-details-drawer';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getImportDefinition, type ImportEntityType } from '@/lib/import/definitions';
import { getImportUiCopy } from '@/lib/import/import-ui-copy';
import type { ValidatedRow } from '@/lib/import/engine/types';
import type { ImportAnalysis } from '@/types/import';

type ImportPreviewProps = {
  analysis: ImportAnalysis;
  entityType: ImportEntityType;
  /** Plural label, e.g. "Products". */
  entityLabel: string;
  /** Singular label, e.g. "Product". Defaults to the plural minus "s". */
  entityLabelSingular?: string;
  onStartOver: () => void;
  /** Called when the user confirms the import. The parent owns the commit. */
  onImport: () => void;
  /** True while the commit is running; locks every action. */
  isImporting: boolean;
};

/**
 * Read-only review screen for one analyzed file: summary, column
 * matching, filterable row preview, and per-row issue details.
 * Consumes the ImportAnalysis as-is — no import logic of its own.
 */
export function ImportPreview({
  analysis,
  entityType,
  entityLabel,
  entityLabelSingular,
  onStartOver,
  onImport,
  isImporting,
}: ImportPreviewProps) {
  const [selectedRow, setSelectedRow] = useState<ValidatedRow | null>(null);

  const definition = getImportDefinition(entityType);
  const allColumns = useMemo(() => definition?.columns ?? [], [definition]);

  // Table columns: definition order, limited to fields that were mapped.
  const mappedColumns = useMemo(() => {
    const mappedFields = new Set(
      analysis.mapping.columnMappings.map((columnMapping) => columnMapping.targetField),
    );

    return allColumns.filter((column) => mappedFields.has(column.field));
  }, [allColumns, analysis.mapping.columnMappings]);

  const { summary } = analysis.report.result;
  const importableCount = summary.validRows + summary.warningRows;
  const singular = entityLabelSingular ?? entityLabel.replace(/s$/i, '');
  const countLabel = importableCount === 1 ? singular : entityLabel;

  // ---- Empty state: the file had no data rows at all -----------------------
  if (summary.totalRows === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <FileX2 className="size-10 text-muted-foreground" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-medium">No data rows found</p>
            <p className="text-sm text-muted-foreground">
              “{analysis.sheetName}” in {analysis.fileName} has headers but no data
              underneath them. Check the file and upload it again.
            </p>
          </div>
          <Button variant="outline" onClick={onStartOver}>
            <RotateCcw />
            Start over
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <ImportGuidancePanel guidance={analysis.guidance} />

      {/* Outcome banner */}
      {importableCount === 0 ? (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Nothing can be imported yet</AlertTitle>
          <AlertDescription>
            Every row has errors. Open a row below to see what needs fixing, correct the
            file, and upload it again.
          </AlertDescription>
        </Alert>
      ) : summary.errorRows === 0 && summary.warningRows === 0 ? (
        <Alert variant="success">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>Everything looks good</AlertTitle>
          <AlertDescription>
            All {summary.totalRows.toLocaleString('en-IN')} rows are ready to import.
          </AlertDescription>
        </Alert>
      ) : null}

      <ImportSummary report={analysis.report} entityLabel={entityLabel} />

      <MappingSummary analysis={analysis} columns={allColumns} />

      <PreviewTable
        rows={analysis.report.result.rows}
        columns={mappedColumns}
        onRowSelect={setSelectedRow}
      />

      {/* Action bar */}
      <Card>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {isImporting ? (
              <>
                Checking for conflicts… Please wait and keep this page open.
              </>
            ) : importableCount > 0 ? (
              <>
                <span className="font-medium text-foreground">
                  {importableCount.toLocaleString('en-IN')} {countLabel.toLowerCase()}
                </span>{' '}
                {getImportUiCopy(entityType).previewConflictHint}
              </>
            ) : (
              'Fix the errors in your file to enable importing.'
            )}
          </p>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="outline" onClick={onStartOver} disabled={isImporting}>
              <RotateCcw />
              Start over
            </Button>
            <Button disabled={importableCount === 0 || isImporting} onClick={onImport}>
              {isImporting ? <Loader2 className="animate-spin" /> : <Import />}
              {isImporting
                ? 'Checking…'
                : `Import ${importableCount.toLocaleString('en-IN')} ${countLabel}`}
            </Button>
          </div>
        </CardContent>
      </Card>

      <RowDetailsDrawer
        row={selectedRow}
        columns={allColumns}
        onClose={() => setSelectedRow(null)}
      />
    </div>
  );
}
