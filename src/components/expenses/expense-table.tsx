'use client';

import Link from 'next/link';
import { Eye, MoreHorizontal, Pencil, SearchX, Trash2 } from 'lucide-react';

import { ExpenseStatusBadge } from '@/components/expenses/expense-status-badge';
import { MoneyDisplay } from '@/components/shared/money-display';
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
import { EXPENSE_CATEGORY_LABELS } from '@/lib/domain/constants/expense';
import { cn } from '@/lib/utils';
import type { ExpenseListItem } from '@/types/expense';

type ExpenseTableProps = {
  expenses: ExpenseListItem[];
  isLoading?: boolean;
  isFetching?: boolean;
  disabled?: boolean;
  onDelete: (expense: ExpenseListItem) => void;
};

const TABLE_COLUMNS = ['Number', 'Date', 'Category', 'Amount', 'Status', 'Actions'];

function ExpenseTableSkeleton() {
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

export function ExpenseTable({
  expenses,
  isLoading,
  isFetching = false,
  disabled = false,
  onDelete,
}: ExpenseTableProps) {
  if (isLoading) {
    return <ExpenseTableSkeleton />;
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
              <TableHead className="min-w-[140px]">Category</TableHead>
              <TableHead className="w-[120px] text-right">Amount</TableHead>
              <TableHead className="w-[90px]">Status</TableHead>
              <TableHead className="w-12 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <SearchX className="size-8 opacity-50" aria-hidden="true" />
                    <p className="text-sm">No expenses to display.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              expenses.map((expense) => {
                const isDraft = expense.status === 'draft';

                return (
                  <TableRow key={expense.id} className="group hover:bg-muted/40">
                    <TableCell className="font-medium">
                      <TruncatedText
                        text={expense.expenseNumber}
                        maxWidthClassName="max-w-[100px]"
                        className="font-mono text-xs sm:text-sm"
                      />
                    </TableCell>
                    <TableCell>{formatDate(expense.expenseDate)}</TableCell>
                    <TableCell>{EXPENSE_CATEGORY_LABELS[expense.category]}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <MoneyDisplay amount={expense.amount} />
                    </TableCell>
                    <TableCell>
                      <ExpenseStatusBadge status={expense.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className="inline-flex size-8 items-center justify-center rounded-md opacity-70 transition-opacity group-hover:opacity-100 hover:bg-muted focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          aria-label={`Actions for ${expense.expenseNumber}`}
                          disabled={disabled}
                        >
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem render={<Link href={`/expenses/${expense.id}`} />}>
                            <Eye />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            render={<Link href={`/expenses/${expense.id}/edit`} />}
                            disabled={disabled || !isDraft}
                          >
                            <Pencil />
                            Edit
                          </DropdownMenuItem>
                          {isDraft ? <DropdownMenuSeparator /> : null}
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => onDelete(expense)}
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
