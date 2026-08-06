'use client';

import Link from 'next/link';
import { Eye, MoreHorizontal, Pencil, SearchX, Trash2 } from 'lucide-react';

import { ProductCategoryIcon } from '@/components/products/product-category-icon';
import { HasRecipeBadge } from '@/components/shared/has-recipe-badge';
import { MoneyDisplay } from '@/components/shared/money-display';
import { StatusBadge } from '@/components/shared/status-badge';
import { TruncatedText } from '@/components/shared/truncated-text';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { getProductStockStatus } from '@/lib/domain/stock-status';
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

function getStockQuantityClassName(currentStock: number): string {
  const status = getProductStockStatus(currentStock);

  if (status === 'out_of_stock') {
    return 'font-medium text-destructive';
  }

  if (status === 'low_stock') {
    return 'font-medium text-warning-foreground';
  }

  return 'tabular-nums';
}

function ProductTableSkeleton() {
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
          'relative max-h-[min(70vh,640px)] overflow-auto',
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
              <TableHead className="hidden w-[130px] lg:table-cell">Recipe</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead className="min-w-[140px] text-right">
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
                    <Link
                      href={`/products/${product.id}`}
                      className="inline-flex max-w-full items-center gap-2 font-medium hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <ProductCategoryIcon category={product.category} />
                      <TruncatedText text={product.name} maxWidthClassName="max-w-[220px]" />
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="inline-flex items-center gap-2">
                      <ProductCategoryIcon category={product.category} className="size-3.5" />
                      <TruncatedText text={product.category} maxWidthClassName="max-w-[120px]" />
                    </span>
                  </TableCell>
                  <TableCell>
                    <MoneyDisplay amount={product.sellingPrice} />
                  </TableCell>
                  <TableCell
                    className={cn(
                      'hidden whitespace-nowrap sm:table-cell',
                      getStockQuantityClassName(product.currentStock),
                    )}
                  >
                    {formatStock(product.currentStock, product.unit)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <HasRecipeBadge hasRecipe={Boolean(product.activeRecipeId)} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge isActive={product.isActive} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        nativeButton={false}
                        variant="ghost"
                        size="sm"
                        render={<Link href={`/products/${product.id}`} />}
                        disabled={disabled}
                      >
                        <Eye />
                        View
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(product.id)}
                        disabled={disabled}
                      >
                        <Pencil />
                        Edit
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className="inline-flex size-8 items-center justify-center rounded-md opacity-70 transition-opacity group-hover:opacity-100 hover:bg-muted focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          aria-label={`More actions for ${product.name}`}
                          disabled={disabled}
                        >
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
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
                    </div>
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
