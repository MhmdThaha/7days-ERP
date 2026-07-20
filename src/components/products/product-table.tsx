'use client';

import Link from 'next/link';
import { Eye, MoreHorizontal, Pencil, SearchX, Trash2 } from 'lucide-react';

import { HasRecipeBadge } from '@/components/shared/has-recipe-badge';
import { MoneyDisplay } from '@/components/shared/money-display';
import { StatusBadge } from '@/components/shared/status-badge';
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
import type { ProductListItem } from '@/types/product';

type ProductTableProps = {
  products: ProductListItem[];
  isLoading?: boolean;
  isFetching?: boolean;
  disabled?: boolean;
  onEdit: (productId: string) => void;
  onDelete: (product: ProductListItem) => void;
};

const TABLE_COLUMNS = [
  'Code',
  'Name',
  'Category',
  'Selling Price',
  'Current Stock',
  'Recipe',
  'Status',
  'Actions',
];

function formatStock(quantity: number, unit: string): string {
  return `${quantity.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${unit}`;
}

function ProductTableSkeleton() {
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

export function ProductTable({
  products,
  isLoading,
  isFetching = false,
  disabled = false,
  onEdit,
  onDelete,
}: ProductTableProps) {
  if (isLoading) {
    return <ProductTableSkeleton />;
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
            <TableHead className="w-[120px]">Code</TableHead>
            <TableHead className="min-w-[160px]">Name</TableHead>
            <TableHead className="hidden w-[140px] md:table-cell">Category</TableHead>
            <TableHead className="w-[120px]">Selling Price</TableHead>
            <TableHead className="hidden w-[120px] sm:table-cell">Current Stock</TableHead>
            <TableHead className="hidden w-[110px] lg:table-cell">Recipe</TableHead>
            <TableHead className="w-[100px]">Status</TableHead>
            <TableHead className="w-12 text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="h-32 text-center">
                <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <SearchX className="size-8 opacity-50" aria-hidden="true" />
                  <p className="text-sm">No products to display.</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            products.map((product) => (
              <TableRow key={product.id} className="group hover:bg-muted/40">
                <TableCell className="font-medium">
                  <TruncatedText
                    text={product.code}
                    maxWidthClassName="max-w-[120px]"
                    className="font-mono text-xs sm:text-sm"
                  />
                </TableCell>
                <TableCell>
                  <TruncatedText text={product.name} maxWidthClassName="max-w-[240px]" />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <TruncatedText text={product.category} maxWidthClassName="max-w-[140px]" />
                </TableCell>
                <TableCell>
                  <MoneyDisplay amount={product.sellingPrice} />
                </TableCell>
                <TableCell className="hidden whitespace-nowrap tabular-nums sm:table-cell">
                  {formatStock(product.currentStock, product.unit)}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <HasRecipeBadge hasRecipe={Boolean(product.activeRecipeId)} />
                </TableCell>
                <TableCell>
                  <StatusBadge isActive={product.isActive} />
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className="inline-flex size-8 items-center justify-center rounded-md opacity-70 transition-opacity group-hover:opacity-100 hover:bg-muted focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      aria-label={`Actions for ${product.name}`}
                      disabled={disabled}
                    >
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem render={<Link href={`/products/${product.id}`} />}>
                        <Eye />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onEdit(product.id)} disabled={disabled}>
                        <Pencil />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => onDelete(product)}
                        disabled={disabled}
                      >
                        <Trash2 />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      </div>
    </TooltipProvider>
  );
}
