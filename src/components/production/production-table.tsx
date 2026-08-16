'use client';

import Link from 'next/link';
import { CheckCircle2, Eye, MoreHorizontal, Pencil, SearchX, Trash2 } from 'lucide-react';

import { ProductionStatusBadge } from '@/components/production/production-status-badge';
import { TruncatedText } from '@/components/shared/truncated-text';
import { Button } from '@/components/ui/button';
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
import { formatProductionQuantityDisplay } from '@/lib/utils/production-quantity-display';
import type { ProductionListItem } from '@/types/production';

type ProductionTableProps = {
  productions: ProductionListItem[];
  isLoading?: boolean;
  isFetching?: boolean;
  disabled?: boolean;
  onDelete: (production: ProductionListItem) => void;
  onComplete: (production: ProductionListItem) => void;
};

const TABLE_COLUMNS = ['Number', 'Date', 'Products', 'Total Units', 'Status', 'Actions'];

function ProductionTableSkeleton() {
  return (
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
  return formatProductionQuantityDisplay(value);
}

export function ProductionTable({
  productions,
  isLoading,
  isFetching = false,
  disabled = false,
  onDelete,
  onComplete,
}: ProductionTableProps) {
  if (isLoading) {
    return <ProductionTableSkeleton />;
  }

  return (
    <TooltipProvider delay={300}>
      <div
        className={cn(
          'relative max-h-[min(70vh,640px)] overflow-auto',
          isFetching && 'opacity-70 transition-opacity',
        )}
        aria-busy={isFetching}
      >
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted/60 shadow-sm">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[100px] text-xs font-semibold tracking-wide text-muted-foreground">
                Number
              </TableHead>
              <TableHead className="w-[110px] text-xs font-semibold tracking-wide text-muted-foreground">
                Date
              </TableHead>
              <TableHead className="hidden w-[90px] text-xs font-semibold tracking-wide text-muted-foreground sm:table-cell">
                Products
              </TableHead>
              <TableHead className="w-[120px] text-xs font-semibold tracking-wide text-muted-foreground">
                Total Units
              </TableHead>
              <TableHead className="w-[90px] text-xs font-semibold tracking-wide text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="min-w-[140px] text-right">
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
                  <TableCell className="font-semibold">
                      <Link
                        href={`/production/${production.id}`}
                        className="font-mono text-xs hover:underline sm:text-sm"
                      >
                        <TruncatedText
                          text={production.productionNumber}
                          maxWidthClassName="max-w-[100px]"
                        />
                      </Link>
                    </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(production.productionDate)}
                  </TableCell>
                  <TableCell className="hidden tabular-nums text-muted-foreground sm:table-cell">
                    {production.lineCount}
                  </TableCell>
                  <TableCell className="font-semibold tabular-nums">
                    {formatQuantity(production.totalUnits)}
                  </TableCell>
                  <TableCell>
                    <ProductionStatusBadge status={production.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {isDraft ? (
                        <Button
                          variant="success"
                          size="default"
                          className="min-h-11 px-3 font-semibold sm:min-h-9"
                          onClick={() => onComplete(production)}
                          disabled={disabled}
                        >
                          <CheckCircle2 />
                          Finish
                        </Button>
                      ) : null}
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className="inline-flex size-11 items-center justify-center rounded-md opacity-100 transition-opacity hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:size-8 sm:opacity-70 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
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
                          {isDraft ? (
                            <>
                              <DropdownMenuItem
                                render={<Link href={`/production/${production.id}/edit`} />}
                                disabled={disabled}
                              >
                                <Pencil />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => onDelete(production)}
                                disabled={disabled}
                              >
                                <Trash2 />
                                Delete
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
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
