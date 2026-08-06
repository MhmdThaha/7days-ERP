'use client';

import Link from 'next/link';
import { Eye, MoreHorizontal, Pencil, SearchX, Trash2 } from 'lucide-react';

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
import { cn } from '@/lib/utils';
import type { RecipeListItem } from '@/types/recipe';

type RecipeTableProps = {
  recipes: RecipeListItem[];
  isLoading?: boolean;
  isFetching?: boolean;
  disabled?: boolean;
  onEdit: (recipeId: string) => void;
  onDelete: (recipe: RecipeListItem) => void;
};

const TABLE_COLUMNS = [
  'Code',
  'Recipe Name',
  'Product',
  'Ingredients',
  'Total Weight',
  'Status',
  'Actions',
];

function RecipeTableSkeleton() {
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

function formatWeight(value: number): string {
  return value.toLocaleString('en-IN', { maximumFractionDigits: 3 });
}

export function RecipeTable({
  recipes,
  isLoading,
  isFetching = false,
  disabled = false,
  onEdit,
  onDelete,
}: RecipeTableProps) {
  if (isLoading) {
    return <RecipeTableSkeleton />;
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
              <TableHead className="w-[100px]">Code</TableHead>
              <TableHead className="min-w-[160px]">Recipe Name</TableHead>
              <TableHead className="hidden min-w-[140px] md:table-cell">Product</TableHead>
              <TableHead className="hidden w-[100px] lg:table-cell">Ingredients</TableHead>
              <TableHead className="hidden w-[120px] sm:table-cell">Total Weight</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead className="min-w-[140px] text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recipes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <SearchX className="size-8 opacity-50" aria-hidden="true" />
                    <p className="text-sm">No recipes to display.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              recipes.map((recipe) => (
                <TableRow key={recipe.id} className="group hover:bg-muted/40">
                  <TableCell className="font-medium">
                    <TruncatedText
                      text={recipe.recipeCode}
                      maxWidthClassName="max-w-[100px]"
                      className="font-mono text-xs sm:text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/recipes/${recipe.id}`}
                      className="font-medium hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <TruncatedText text={recipe.recipeName} maxWidthClassName="max-w-[240px]" />
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <TruncatedText text={recipe.productName} maxWidthClassName="max-w-[180px]" />
                  </TableCell>
                  <TableCell className="hidden tabular-nums lg:table-cell">
                    {recipe.ingredientCount}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{formatWeight(recipe.totalWeight)}</TableCell>
                  <TableCell>
                    <StatusBadge isActive={recipe.isActive} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        nativeButton={false}
                        variant="ghost"
                        size="sm"
                        render={<Link href={`/recipes/${recipe.id}`} />}
                        disabled={disabled}
                      >
                        <Eye />
                        View
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(recipe.id)}
                        disabled={disabled}
                      >
                        <Pencil />
                        Edit
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className="inline-flex size-8 items-center justify-center rounded-md opacity-70 transition-opacity group-hover:opacity-100 hover:bg-muted focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          aria-label={`More actions for ${recipe.recipeName}`}
                          disabled={disabled}
                        >
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => onDelete(recipe)}
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
