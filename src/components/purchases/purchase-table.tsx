'use client';

import Link from 'next/link';
import { Eye, MoreHorizontal, PackageCheck, Pencil, SearchX, Trash2 } from 'lucide-react';

import { MoneyDisplay } from '@/components/shared/money-display';
import { PaymentStatusBadge } from '@/components/purchases/payment-status-badge';
import { PurchaseStatusBadge } from '@/components/purchases/purchase-status-badge';
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
import { debugLog } from '@/lib/debug/sprint-debug';
import { cn } from '@/lib/utils';
import type { PurchaseListItem } from '@/types/purchase';

type PurchaseTableProps = {
  purchases: PurchaseListItem[];
  isLoading?: boolean;
  isFetching?: boolean;
  disabled?: boolean;
  onDelete: (purchase: PurchaseListItem) => void;
  onReceive: (purchase: PurchaseListItem) => void;
};

const TABLE_COLUMNS = [
  'Number',
  'Date',
  'Supplier',
  'Invoice',
  'Lines',
  'Total',
  'Payment',
  'Status',
  'Actions',
];

function PurchaseTableSkeleton() {
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

export function PurchaseTable({
  purchases,
  isLoading,
  isFetching = false,
  disabled = false,
  onDelete,
  onReceive,
}: PurchaseTableProps) {
  debugLog('PurchaseTable', 'RENDER', {
    rowsReceived: purchases.length,
    isLoading: Boolean(isLoading),
    isFetching,
    renders: isLoading ? 'skeleton (5 placeholder rows)' : purchases.length === 0 ? 'empty row: "No purchases to display."' : `${purchases.length} data rows`,
  });

  if (isLoading) {
    return <PurchaseTableSkeleton />;
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
              <TableHead className="min-w-[160px]">Supplier</TableHead>
              <TableHead className="hidden w-[120px] md:table-cell">Invoice</TableHead>
              <TableHead className="hidden w-[70px] lg:table-cell">Lines</TableHead>
              <TableHead className="w-[120px]">Total</TableHead>
              <TableHead className="hidden w-[100px] sm:table-cell">Payment</TableHead>
              <TableHead className="w-[90px]">Status</TableHead>
              <TableHead className="w-12 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <SearchX className="size-8 opacity-50" aria-hidden="true" />
                    <p className="text-sm">No purchases to display.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              purchases.map((purchase) => {
                const isDraft = purchase.status === 'draft';

                return (
                  <TableRow key={purchase.id} className="group hover:bg-muted/40">
                    <TableCell className="font-medium">
                      <Link
                        href={`/purchases/${purchase.id}`}
                        className="font-mono text-xs hover:underline sm:text-sm"
                      >
                        <TruncatedText
                          text={purchase.purchaseNumber}
                          maxWidthClassName="max-w-[100px]"
                        />
                      </Link>
                    </TableCell>
                    <TableCell>{formatDate(purchase.purchaseDate)}</TableCell>
                    <TableCell>
                      <TruncatedText text={purchase.supplierName} maxWidthClassName="max-w-[220px]" />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <TruncatedText
                        text={purchase.invoiceNumber ?? '—'}
                        maxWidthClassName="max-w-[120px]"
                      />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{purchase.lineItemCount}</TableCell>
                    <TableCell>
                      <MoneyDisplay amount={purchase.totalAmount} />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <PaymentStatusBadge paymentStatus={purchase.paymentStatus} />
                    </TableCell>
                    <TableCell>
                      <PurchaseStatusBadge status={purchase.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className="inline-flex size-8 items-center justify-center rounded-md opacity-70 transition-opacity group-hover:opacity-100 hover:bg-muted focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          aria-label={`Actions for ${purchase.purchaseNumber}`}
                          disabled={disabled}
                        >
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem render={<Link href={`/purchases/${purchase.id}`} />}>
                            <Eye />
                            View Details
                          </DropdownMenuItem>
                          {isDraft ? (
                            <>
                              <DropdownMenuItem onClick={() => onReceive(purchase)} disabled={disabled}>
                                <PackageCheck />
                                Receive Purchase
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                render={<Link href={`/purchases/${purchase.id}/edit`} />}
                                disabled={disabled}
                              >
                                <Pencil />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => onDelete(purchase)}
                                disabled={disabled}
                              >
                                <Trash2 />
                                Delete
                              </DropdownMenuItem>
                            </>
                          ) : null}
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
