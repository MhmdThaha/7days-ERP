'use client';

import { ArrowRight } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { ColumnDefinition } from '@/lib/import/engine/types';
import type { ImportAnalysis } from '@/types/import';

type MappingSummaryProps = {
  analysis: ImportAnalysis;
  /** Target-field definitions, used for human-readable labels. */
  columns: readonly ColumnDefinition[];
};

/** Shows how file columns were matched to target fields, which columns
 *  were ignored, and which required fields have no source column. */
export function MappingSummary({ analysis, columns }: MappingSummaryProps) {
  const labelByField = new Map(columns.map((column) => [column.field, column.label]));

  const { report, mapping } = analysis;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Column matching</CardTitle>
        <CardDescription>
          How the columns in your file were matched to {`BakeryOS`} fields.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {report.missingRequiredFields.length > 0 ? (
          <Alert variant="destructive">
            <AlertTitle>Required information is missing</AlertTitle>
            <AlertDescription>
              No column in the file could be matched to:{' '}
              {report.missingRequiredFields
                .map((field) => labelByField.get(field) ?? field)
                .join(', ')}
              . Add the column to your file and upload it again.
            </AlertDescription>
          </Alert>
        ) : null}

        <ul className="grid gap-2 sm:grid-cols-2">
          {mapping.columnMappings.map((columnMapping) => (
            <li
              key={columnMapping.targetField}
              className="flex items-center gap-2 rounded-lg border bg-muted/25 px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate" title={columnMapping.sourceHeader}>
                {columnMapping.sourceHeader}
              </span>
              <ArrowRight
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-right font-medium">
                {labelByField.get(columnMapping.targetField) ?? columnMapping.targetField}
              </span>
            </li>
          ))}
        </ul>

        {report.ignoredHeaders.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Ignored columns</p>
            <p className="text-sm text-muted-foreground">
              These columns were not recognized and will not be imported:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {report.ignoredHeaders.map((header) => (
                <Badge key={header} variant="neutral">
                  {header}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
