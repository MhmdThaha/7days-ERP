'use client';

import Link from 'next/link';
import { Eye, MoreHorizontal, Pencil, SearchX, Trash2 } from 'lucide-react';

import { ProductionStatusBadge } from '@/components/production/production-status-badge';
import { TruncatedText } from '@/components/shared/truncated-text';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ProductionListItem } from '@/types/production';

type ProductionTableProps = {
  productions: ProductionListItem[];
  isLoading?: boolean;
  isFetching?: boolean;
  disabled?: boolean;
  onDelete: (production: ProductionListItem) => void;
};

const TABLE_COLUMNS = ['Number', 'Date', 'Products', 'Total Units', 'Status', 'Actions'];

function ProductionTableSkeleton() {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {TABLE_COLUMNS.map((column) => (
              <TableHead key={column}>{column}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, index) => (
            <TableRow key={index}>
              {TABLE_COLUMNS.map((column) => (
                <TableCell key={column}>
                  <Skeleton className="h-4 w-full max-w-[120px]" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function formatDate(date: string): string {
  const [year, month, day] = date.split('-');

  if (!year || !month || !day) {
    return date;
  }

  return `${day}/${month}/${year}`;
}

function formatQuantity(value: number): string {
  return value.toLocaleString('en-IN', { maximumFractionDigits: 3 });
}

export function ProductionTable({
  productions,
  isLoading,
  isFetching = false,
  disabled = false,
  onDelete,
}: ProductionTableProps) {
  if (isLoading) {
    return <ProductionTableSkeleton />;
  }

  return (
    <TooltipProvider delay={300}>
      <div
        className={cn(
          'relative max-h-[min(70vh,640px)] overflow-auto rounded-lg border',
          isFetching && 'opacity-70 transition-opacity',
        )}
        aria-busy={isFetching}
      >
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
            <TableRow>
              <TableHead className="w-[100px]">Number</TableHead>
              <TableHead className="w-[110px]">Date</TableHead>
              <TableHead className="hidden w-[90px] sm:table-cell">Products</TableHead>
              <TableHead className="w-[120px]">Total Units</TableHead>
              <TableHead className="w-[90px]">Status</TableHead>
              <TableHead className="w-12 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {productions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <SearchX className="size-8 opacity-50" aria-hidden="true" />
                    <p className="text-sm">No production entries to display.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              productions.map((production) => {
                const isDraft = production.status === 'draft';

                return (
                <TableRow key={production.id} className="group hover:bg-muted/40">
                  <TableCell className="font-medium">
                    <TruncatedText
                      text={production.productionNumber}
                      maxWidthClassName="max-w-[100px]"
                      className="font-mono text-xs sm:text-sm"
                    />
                  </TableCell>
                  <TableCell>{formatDate(production.productionDate)}</TableCell>
                  <TableCell className="hidden sm:table-cell">{production.lineCount}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatQuantity(production.totalUnits)}
                  </TableCell>
                  <TableCell>
                    <ProductionStatusBadge status={production.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="inline-flex size-8 items-center justify-center rounded-md opacity-70 transition-opacity group-hover:opacity-100 hover:bg-muted focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        aria-label={`Actions for ${production.productionNumber}`}
                        disabled={disabled}
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem render={<Link href={`/production/${production.id}`} />}>
                          <Eye />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          render={<Link href={`/production/${production.id}/edit`} />}
                          disabled={disabled || !isDraft}
                        >
                          <Pencil />
                          Edit
                        </DropdownMenuItem>
                        {isDraft ? <DropdownMenuSeparator /> : null}
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => onDelete(production)}
                          disabled={disabled || !isDraft}
                        >
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}
