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
};

function formatQuantity(value: number): string {
  return value.toLocaleString('en-IN', { maximumFractionDigits: 3 });
}

export function ProductionMaterialPreview({
  rows,
  isLoading = false,
  hasValidLines,
}: ProductionMaterialPreviewProps) {
  const shortageCount = rows.filter((row) => row.shortage > 0).length;

  if (isLoading) {
    return (
      <div className="space-y-3 rounded-lg border bg-muted/20 p-4" aria-busy="true">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!hasValidLines) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
        Add products with quantities to preview required raw materials.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <div>
        <h3 className="text-sm font-semibold">Material Preview</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Read-only estimate based on active recipes and current stock. Inventory is not changed
          until production is completed in a later phase.
        </p>
      </div>

      {shortageCount > 0 ? (
        <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-950">
          <AlertTriangle className="text-amber-700" />
          <AlertTitle>Insufficient stock preview</AlertTitle>
          <AlertDescription>
            {shortageCount} material{shortageCount === 1 ? '' : 's'} below required quantity.
            This is informational only for draft entries.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="overflow-x-auto rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[180px]">Raw Material</TableHead>
              <TableHead className="text-right whitespace-nowrap">Required</TableHead>
              <TableHead className="text-right whitespace-nowrap">In Stock</TableHead>
              <TableHead className="text-right whitespace-nowrap">Shortage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-sm text-muted-foreground">
                  No materials to preview for the selected products.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.rawMaterialId}>
                  <TableCell>
                    <span className="font-mono text-xs text-muted-foreground">{row.rawMaterialCode}</span>
                    <span className="mx-1.5 text-muted-foreground">·</span>
                    {row.rawMaterialName}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQuantity(row.requiredQuantity)} {row.unit}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQuantity(row.currentStock)} {row.unit}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${
                      row.shortage > 0 ? 'font-medium text-destructive' : 'text-muted-foreground'
                    }`}
                  >
                    {row.shortage > 0 ? `${formatQuantity(row.shortage)} ${row.unit}` : '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
