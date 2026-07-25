'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { getProductAction } from '@/actions/products';
import { deleteRecipeAction, getRecipeAction } from '@/actions/recipes';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { LoadErrorAlert } from '@/components/shared/load-error-alert';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { TruncatedText } from '@/components/shared/truncated-text';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { toastFormError } from '@/lib/utils/toast-form-error';

type RecipeDetailPageProps = {
  recipeId: string;
};

function formatDateTime(date: Date): string {
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatWeight(value: number): string {
  return value.toLocaleString('en-IN', { maximumFractionDigits: 3 });
}

export function RecipeDetailPage({ recipeId }: RecipeDetailPageProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: recipe, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['recipe', recipeId],
    queryFn: async () => {
      const result = await getRecipeAction(recipeId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
  });

  const { data: product } = useQuery({
    queryKey: ['product', recipe?.productId],
    queryFn: async () => {
      const result = await getProductAction(recipe!.productId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    enabled: Boolean(recipe?.productId),
  });

  async function handleDelete() {
    if (isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      const result = await deleteRecipeAction(recipeId);

      if (!result.success) {
        toastFormError(result.error);
        return;
      }

      toast.success('Recipe deleted successfully');
      setIsDeleteOpen(false);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['recipes'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
      ]);

      router.push('/recipes');
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading recipe">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !recipe) {
    return (
      <div className="space-y-4">
        <LoadErrorAlert
          title="Unable to load recipe"
          error={error}
          onRetry={() => void refetch()}
          isRetrying={isRefetching}
        />
        {!error ? (
          <Alert variant="destructive">
            <AlertTitle>Recipe not found</AlertTitle>
            <AlertDescription>The requested recipe could not be loaded.</AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }

  return (
    <TooltipProvider delay={300}>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/recipes" />}>
            <ArrowLeft />
            Back to Recipes
          </Button>
        </div>

        <PageHeader
          title={
            <TruncatedText
              text={recipe.recipeName}
              maxWidthClassName="max-w-[min(100%,480px)]"
              className="text-left font-heading text-2xl font-semibold tracking-tight"
            />
          }
        >
          <div className="flex shrink-0 gap-2">
            <Button nativeButton={false} variant="outline" render={<Link href={`/recipes/${recipeId}/edit`} />}>
              <Pencil />
              Edit
            </Button>
            <Button variant="destructive" onClick={() => setIsDeleteOpen(true)} disabled={isDeleting}>
              <Trash2 />
              Delete
            </Button>
          </div>
        </PageHeader>

        <Card>
          <CardHeader>
            <CardTitle>Recipe Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <DetailField
              label="Recipe Code"
              value={
                <TruncatedText
                  text={recipe.recipeCode}
                  maxWidthClassName="max-w-full"
                  className="font-mono"
                />
              }
            />
            <DetailField
              label="Product"
              value={
                product ? (
                  <Link href={`/products/${product.id}`} className="text-primary hover:underline">
                    {product.name}
                  </Link>
                ) : (
                  '—'
                )
              }
            />
            <DetailField label="Version" value={recipe.version} />
            <DetailField label="Status" value={<StatusBadge isActive={recipe.isActive} />} />
            <DetailField label="Ingredient Count" value={recipe.ingredients.length} />
            <DetailField label="Total Weight" value={formatWeight(recipe.totalWeight)} />
            <DetailField
              label="Notes"
              value={
                <span className="break-words whitespace-pre-wrap">{recipe.notes ?? '—'}</span>
              }
              className="sm:col-span-2"
            />
            <DetailField label="Created At" value={formatDateTime(recipe.createdAt)} />
            <DetailField label="Updated At" value={formatDateTime(recipe.updatedAt)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ingredients</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Raw Material</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead>Unit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipe.ingredients.map((ingredient, index) => (
                    <TableRow key={`${ingredient.rawMaterialId}-${index}`}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>{ingredient.rawMaterialName}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatWeight(ingredient.quantity)}
                      </TableCell>
                      <TableCell>{ingredient.unit}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
          </CardContent>
        </Card>

        <ConfirmDialog
          open={isDeleteOpen}
          onOpenChange={(open) => {
            if (isDeleting) {
              return;
            }

            setIsDeleteOpen(open);
          }}
          title="Delete recipe?"
          description={`This will soft-delete "${recipe.recipeName}". The linked product will no longer show a recipe badge.`}
          confirmLabel="Delete"
          confirmVariant="destructive"
          loadingLabel="Deleting..."
          isLoading={isDeleting}
          onConfirm={handleDelete}
        />
      </div>
    </TooltipProvider>
  );
}

function DetailField({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}
