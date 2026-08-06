'use client';

import { AlertTriangle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { MaterialPreviewRow } from '@/types/production';

type ProductionMaterialPreviewProps = {
  rows: MaterialPreviewRow[];
  isLoading?: boolean;
  hasValidLines: boolean;
  mode?: 'draft' | 'completed';
  comfortableTable?: boolean;
  embedded?: boolean;
};

const DETAIL_TABLE_HEAD_CLASS =
  'normal-case text-sm font-medium tracking-normal';
const DETAIL_TABLE_CELL_CLASS = 'py-4 text-base';

function formatQuantity(value: number): string {
  return value.toLocaleString('en-IN', { maximumFractionDigits: 3 });
}

export function ProductionMaterialPreview({
  rows,
  isLoading = false,
  hasValidLines,
  mode = 'draft',
  comfortableTable = false,
  embedded = false,
}: ProductionMaterialPreviewProps) {
  const shortageCount = rows.filter((row) => row.shortage > 0).length;
  const isCompleted = mode === 'completed';

  if (isLoading) {
    return (
      <div className={embedded ? 'space-y-3' : 'space-y-3 rounded-lg border bg-muted/20 p-4'} aria-busy="true">
        {!embedded ? <Skeleton className="h-5 w-48" /> : null}
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!hasValidLines) {
    return (
      <div
        className={
          embedded
            ? 'rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground'
            : 'rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground'
        }
      >
        {isCompleted
          ? 'No ingredients were recorded for this production.'
          : 'Add products with quantities to see the ingredients needed.'}
      </div>
    );
  }

  return (
    <div className={embedded ? 'space-y-3' : 'space-y-3 rounded-lg border bg-muted/20 p-4'}>
      {!embedded ? (
        <div>
          <h3 className="text-base font-semibold">
            {isCompleted ? 'Ingredients Used' : 'Ingredients Needed'}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {isCompleted
              ? 'Ingredients taken from stock when this production was finished.'
              : 'How much of each ingredient this batch will use. Stock is updated only when you finish production.'}
          </p>
        </div>
      ) : null}

      {!isCompleted && shortageCount > 0 ? (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>You may not have enough stock</AlertTitle>
          <AlertDescription>
            {shortageCount} ingredient{shortageCount === 1 ? '' : 's'} look short for this batch.
            This is a preview only — you can still review the draft.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="overflow-x-auto rounded-lg border bg-background">
        <Table className={comfortableTable ? 'text-base' : undefined}>
          <TableHeader>
            <TableRow>
              <TableHead
                className={`min-w-[180px] ${comfortableTable ? DETAIL_TABLE_HEAD_CLASS : ''}`}
              >
                Ingredient
              </TableHead>
              <TableHead
                className={`text-right whitespace-nowrap ${comfortableTable ? DETAIL_TABLE_HEAD_CLASS : ''}`}
              >
                {isCompleted ? 'Used' : 'Needed'}
              </TableHead>
              {!isCompleted ? (
                <>
                  <TableHead
                    className={`text-right whitespace-nowrap ${comfortableTable ? DETAIL_TABLE_HEAD_CLASS : ''}`}
                  >
                    In Stock
                  </TableHead>
                  <TableHead
                    className={`text-right whitespace-nowrap ${comfortableTable ? DETAIL_TABLE_HEAD_CLASS : ''}`}
                  >
                    Shortage
                  </TableHead>
                </>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={isCompleted ? 2 : 4}
                  className={`h-24 text-center text-muted-foreground ${comfortableTable ? 'py-4 text-base' : 'text-sm'}`}
                >
                  {isCompleted
                    ? 'No ingredients recorded for this production.'
                    : 'No ingredients to show for the selected products.'}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.rawMaterialId}>
                  <TableCell className={comfortableTable ? DETAIL_TABLE_CELL_CLASS : undefined}>
                    <span
                      className={`font-mono text-muted-foreground ${comfortableTable ? 'text-sm' : 'text-xs'}`}
                    >
                      {row.rawMaterialCode}
                    </span>
                    <span className="mx-1.5 text-muted-foreground">·</span>
                    {row.rawMaterialName}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${comfortableTable ? DETAIL_TABLE_CELL_CLASS : ''}`}
                  >
                    {formatQuantity(row.requiredQuantity)} {row.unit}
                  </TableCell>
                  {!isCompleted ? (
                    <>
                      <TableCell
                        className={`text-right tabular-nums ${comfortableTable ? DETAIL_TABLE_CELL_CLASS : ''}`}
                      >
                        {formatQuantity(row.currentStock)} {row.unit}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${
                          comfortableTable ? DETAIL_TABLE_CELL_CLASS : ''
                        } ${
                          row.shortage > 0 ? 'font-medium text-warning-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        {row.shortage > 0 ? `${formatQuantity(row.shortage)} ${row.unit}` : '—'}
                      </TableCell>
                    </>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
