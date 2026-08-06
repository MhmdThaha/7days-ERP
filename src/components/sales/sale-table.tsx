'use client';

import Link from 'next/link';
import { CheckCircle2, Eye, MoreHorizontal, Pencil, SearchX, Trash2 } from 'lucide-react';

import { MoneyDisplay } from '@/components/shared/money-display';
import { SaleStatusBadge } from '@/components/sales/sale-status-badge';
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
import type { SaleListItem } from '@/types/sale';

type SaleTableProps = {
  sales: SaleListItem[];
  isLoading?: boolean;
  isFetching?: boolean;
  disabled?: boolean;
  onDelete: (sale: SaleListItem) => void;
  onComplete: (sale: SaleListItem) => void;
};

const TABLE_COLUMNS = ['Number', 'Date', 'Customer', 'Lines', 'Subtotal', 'Status', 'Actions'];

function SaleTableSkeleton() {
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

export function SaleTable({
  sales,
  isLoading,
  isFetching = false,
  disabled = false,
  onDelete,
  onComplete,
}: SaleTableProps) {
  if (isLoading) {
    return <SaleTableSkeleton />;
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
          <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
            <TableRow>
              <TableHead className="w-[100px]">Number</TableHead>
              <TableHead className="w-[110px]">Date</TableHead>
              <TableHead className="min-w-[160px]">Customer</TableHead>
              <TableHead className="hidden w-[70px] sm:table-cell">Lines</TableHead>
              <TableHead className="w-[120px]">Subtotal</TableHead>
              <TableHead className="w-[90px]">Status</TableHead>
              <TableHead className="min-w-[140px] text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sales.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <SearchX className="size-8 opacity-50" aria-hidden="true" />
                    <p className="text-sm">No sales to display.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              sales.map((sale) => {
                const isDraft = sale.status === 'draft';

                return (
                  <TableRow key={sale.id} className="group hover:bg-muted/40">
                    <TableCell className="font-medium">
                      <Link
                        href={`/sales/${sale.id}`}
                        className="font-mono text-xs hover:underline sm:text-sm"
                      >
                        <TruncatedText
                          text={sale.saleNumber}
                          maxWidthClassName="max-w-[100px]"
                        />
                      </Link>
                    </TableCell>
                    <TableCell>{formatDate(sale.saleDate)}</TableCell>
                    <TableCell>
                      <TruncatedText
                        text={sale.customerNameSnapshot ?? '—'}
                        maxWidthClassName="max-w-[220px]"
                      />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{sale.lineCount}</TableCell>
                    <TableCell>
                      <MoneyDisplay amount={sale.subtotal} />
                    </TableCell>
                    <TableCell>
                      <SaleStatusBadge status={sale.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isDraft ? (
                          <Button
                            variant="success"
                            size="default"
                            onClick={() => onComplete(sale)}
                            disabled={disabled}
                          >
                            <CheckCircle2 />
                            Complete
                          </Button>
                        ) : null}
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className="inline-flex size-8 items-center justify-center rounded-md opacity-70 transition-opacity group-hover:opacity-100 hover:bg-muted focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            aria-label={`Actions for ${sale.saleNumber}`}
                            disabled={disabled}
                          >
                            <MoreHorizontal className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem render={<Link href={`/sales/${sale.id}`} />}>
                              <Eye />
                              View Details
                            </DropdownMenuItem>
                            {isDraft ? (
                              <>
                                <DropdownMenuItem
                                  render={<Link href={`/sales/${sale.id}/edit`} />}
                                  disabled={disabled}
                                >
                                  <Pencil />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => onDelete(sale)}
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
