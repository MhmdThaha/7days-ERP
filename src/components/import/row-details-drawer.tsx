'use client';

import { AlertTriangle, XCircle } from 'lucide-react';

import { formatPreviewValue } from '@/components/import/preview-format';
import { RowStatusBadge } from '@/components/import/row-status-badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import type { ColumnDefinition, ValidatedRow } from '@/lib/import/engine/types';

type RowDetailsDrawerProps = {
  row: ValidatedRow | null;
  columns: readonly ColumnDefinition[];
  onClose: () => void;
};

/** Right-hand drawer showing every issue and every value for one row. */
export function RowDetailsDrawer({ row, columns, onClose }: RowDetailsDrawerProps) {
  const labelByField = new Map(columns.map((column) => [column.field, column.label]));

  return (
    <Sheet open={row !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent side="right" className="overflow-y-auto">
        {row ? (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <SheetTitle>Row {row.rowNumber}</SheetTitle>
                <RowStatusBadge status={row.status} />
              </div>
              <SheetDescription>
                {row.issues.length === 0
                  ? 'This row is ready to import.'
                  : `${row.issues.length} issue${row.issues.length === 1 ? '' : 's'} found in this row.`}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 px-4 pb-4">
              {row.issues.length > 0 ? (
                <ul className="space-y-2" aria-label="Issues">
                  {row.issues.map((issue, index) => (
                    <li
                      key={`${issue.code}-${issue.field ?? 'row'}-${index}`}
                      className="flex items-start gap-2 rounded-lg border p-3 text-sm"
                    >
                      {issue.severity === 'error' ? (
                        <XCircle
                          className="mt-0.5 size-4 shrink-0 text-destructive"
                          aria-hidden="true"
                        />
                      ) : (
                        <AlertTriangle
                          className="mt-0.5 size-4 shrink-0 text-warning-foreground"
                          aria-hidden="true"
                        />
                      )}
                      <div className="min-w-0 space-y-0.5">
                        {issue.field ? (
                          <p className="font-medium">
                            {labelByField.get(issue.field) ?? issue.field}
                          </p>
                        ) : (
                          <p className="font-medium">Whole row</p>
                        )}
                        <p className="text-muted-foreground">{issue.message}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}

              <Separator />

              <div className="space-y-1.5">
                <p className="text-sm font-medium">Values in this row</p>
                <dl className="space-y-1">
                  {columns
                    .filter((column) => column.field in row.values)
                    .map((column) => (
                      <div
                        key={column.field}
                        className="flex items-baseline justify-between gap-3 py-1 text-sm"
                      >
                        <dt className="shrink-0 text-muted-foreground">{column.label}</dt>
                        <dd className="min-w-0 truncate text-right font-medium">
                          {formatPreviewValue(row.values[column.field], column.dataType)}
                        </dd>
                      </div>
                    ))}
                </dl>
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
