'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ImportReviewReportSummaryViewModel } from '@/lib/import/review/types';

type ImportReviewReportSummaryProps = {
  summary: ImportReviewReportSummaryViewModel;
};

/** Section 2 — report detection column coverage (read-only). */
export function ImportReviewReportSummary({ summary }: ImportReviewReportSummaryProps) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-base">Report summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 pt-4">
        <section aria-labelledby="matched-columns-heading">
          <h3 id="matched-columns-heading" className="mb-2 text-sm font-medium">
            Matched columns
          </h3>
          {summary.matchedColumns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No columns matched.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {summary.matchedColumns.map((column) => (
                <li key={`${column.key}-${column.header}`}>
                  <Badge variant="outline" title={column.label}>
                    {column.header} → {column.label}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="missing-columns-heading">
          <h3 id="missing-columns-heading" className="mb-2 text-sm font-medium">
            Missing required columns
          </h3>
          {summary.missingRequiredColumns.length === 0 ? (
            <p className="text-sm text-muted-foreground">All required columns are present.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {summary.missingRequiredColumns.map((column) => (
                <li key={column.key}>
                  <Badge variant="warning">{column.label}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="extra-columns-heading">
          <h3 id="extra-columns-heading" className="mb-2 text-sm font-medium">
            Extra columns
          </h3>
          {summary.extraColumns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No extra columns.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {summary.extraColumns.map((header) => (
                <li key={header}>
                  <Badge variant="secondary">{header}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="unknown-headers-heading">
          <h3 id="unknown-headers-heading" className="mb-2 text-sm font-medium">
            Unknown headers
          </h3>
          {summary.unknownHeaders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No unknown headers.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {summary.unknownHeaders.map((header) => (
                <li key={header}>
                  <Badge variant="neutral">{header}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="detection-reasons-heading">
          <h3 id="detection-reasons-heading" className="mb-2 text-sm font-medium">
            Report detection reasons
          </h3>
          {summary.detectionReasons.length === 0 ? (
            <p className="text-sm text-muted-foreground">No detection notes.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {summary.detectionReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
