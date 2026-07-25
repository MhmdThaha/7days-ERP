'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  completeProductionAction,
  deleteProductionAction,
  getProductionAction,
} from '@/actions/production';
import { getRecipeAction } from '@/actions/recipes';
import { ProductionMaterialPreview } from '@/components/production/production-material-preview';
import { ProductionStatusBadge } from '@/components/production/production-status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DraftActionBanner } from '@/components/shared/draft-action-banner';
import { LoadErrorAlert } from '@/components/shared/load-error-alert';
import { PageHeader } from '@/components/shared/page-header';
import { TruncatedText } from '@/components/shared/truncated-text';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useRawMaterialsByIds } from '@/hooks/use-raw-materials-by-ids';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { buildMaterialPreview } from '@/lib/domain/calculations/production-materials';
import { toastFormError } from '@/lib/utils/toast-form-error';
import { invalidateDailyReportQueries, invalidateDashboardQueries, invalidateMonthlyReportQueries } from '@/lib/utils/query-invalidation';
import { toastWorkflowComplete } from '@/lib/utils/workflow-toasts';
import type { Recipe } from '@/types/recipe';

type ProductionDetailPageProps = {
  productionId: string;
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

export function ProductionDetailPage({ productionId }: ProductionDetailPageProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isCompleteOpen, setIsCompleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const { data: production, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['production', productionId],
    queryFn: async () => {
      const result = await getProductionAction(productionId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
  });

  const recipeIds = useMemo(
    () => [...new Set((production?.lines ?? []).map((line) => line.recipeId))].sort(),
    [production?.lines],
  );

  const { data: recipes, isLoading: isLoadingRecipes } = useQuery({
    queryKey: ['recipes', 'production-detail', recipeIds],
    enabled: recipeIds.length > 0,
    queryFn: async () => {
      const results = await Promise.all(recipeIds.map((id) => getRecipeAction(id)));
      const loaded: Recipe[] = [];

      for (const result of results) {
        if (result.success) {
          loaded.push(result.data);
        }
      }

      return loaded;
    },
  });

  const previewMaterialIds = useMemo(() => {
    const ids = new Set<string>();

    for (const recipe of recipes ?? []) {
      for (const ingredient of recipe.ingredients) {
        ids.add(ingredient.rawMaterialId);
      }
    }

    return [...ids];
  }, [recipes]);

  const { rawMaterialsById, isLoading: isLoadingRawMaterials } =
    useRawMaterialsByIds(previewMaterialIds);

  const recipesById = useMemo(() => {
    const map = new Map<string, Recipe>();

    for (const recipe of recipes ?? []) {
      map.set(recipe.id, recipe);
    }

    return map;
  }, [recipes]);

  const materialPreviewRows = useMemo(() => {
    if (!production) {
      return [];
    }

    return buildMaterialPreview(
      production.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        recipeId: line.recipeId,
      })),
      recipesById,
      rawMaterialsById,
    );
  }, [production, recipesById, rawMaterialsById]);

  async function invalidateProductionQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['productions'] }),
      queryClient.invalidateQueries({ queryKey: ['production', productionId] }),
      queryClient.invalidateQueries({ queryKey: ['raw-materials'] }),
      queryClient.invalidateQueries({ queryKey: ['products'] }),
      invalidateDashboardQueries(queryClient),
      invalidateDailyReportQueries(queryClient),
      invalidateMonthlyReportQueries(queryClient),
    ]);
  }

  async function handleDelete() {
    if (isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      const result = await deleteProductionAction(productionId);

      if (!result.success) {
        toastFormError(result.error);
        return;
      }

      toast.success('Production draft deleted successfully');
      setIsDeleteOpen(false);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['productions'] }),
        invalidateDashboardQueries(queryClient),
        invalidateDailyReportQueries(queryClient),
        invalidateMonthlyReportQueries(queryClient),
      ]);

      router.push('/production');
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleComplete() {
    if (isCompleting) {
      return;
    }

    setIsCompleting(true);

    try {
      const result = await completeProductionAction(productionId);

      if (!result.success) {
        toastFormError(result.error);
        return;
      }

      toastWorkflowComplete(
        'Production completed. Raw materials deducted and product stock updated.',
        {
          nextStep: {
            label: 'Record Sale',
            onClick: () => router.push('/sales/new'),
          },
        },
      );
      setIsCompleteOpen(false);

      await invalidateProductionQueries();
    } finally {
      setIsCompleting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading production">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !production) {
    return (
      <div className="space-y-4">
        <LoadErrorAlert
          title="Unable to load production entry"
          error={error}
          onRetry={() => void refetch()}
          isRetrying={isRefetching}
        />
        {!error ? (
          <Alert variant="destructive">
            <AlertTitle>Production entry not found</AlertTitle>
            <AlertDescription>The requested production entry could not be loaded.</AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }

  const canEdit = production.status === 'draft';
  const isBusy = isDeleting || isCompleting;
  const isPreviewLoading = isLoadingRecipes || isLoadingRawMaterials;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/production" />}>
          <ArrowLeft />
          Back to Production
        </Button>
      </div>

      <PageHeader
        title={
          <TruncatedText
            text={production.productionNumber}
            maxWidthClassName="max-w-[min(100%,480px)]"
            className="text-left font-heading text-2xl font-semibold tracking-tight"
          />
        }
      >
        {canEdit ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              nativeButton={false}
              variant="outline"
              render={<Link href={`/production/${productionId}/edit`} />}
              disabled={isBusy}
            >
              <Pencil />
              Edit
            </Button>
            <Button variant="destructive" onClick={() => setIsDeleteOpen(true)} disabled={isBusy}>
              <Trash2 />
              Delete
            </Button>
          </div>
        ) : null}
      </PageHeader>

      {canEdit ? (
        <DraftActionBanner
          title="Draft production — stock not updated yet"
          description="Review material usage below, then complete to deduct ingredients and add finished goods."
          actionLabel="Complete Production"
          onAction={() => setIsCompleteOpen(true)}
          icon={CheckCircle2}
          disabled={isBusy}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Production Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <DetailField label="Production Date" value={formatDate(production.productionDate)} />
          <DetailField label="Status" value={<ProductionStatusBadge status={production.status} />} />
          <DetailField
            label="Total Units"
            value={<span className="font-medium tabular-nums">{formatQuantity(production.totalUnits)}</span>}
          />
          <DetailField label="Product Lines" value={production.lineCount} />
          <DetailField
            label="Notes"
            value={
              <span className="break-words whitespace-pre-wrap">{production.notes ?? '—'}</span>
            }
            className="sm:col-span-2"
          />
          <DetailField label="Created At" value={formatDateTime(production.createdAt)} />
          <DetailField label="Updated At" value={formatDateTime(production.updatedAt)} />
          {production.completedAt ? (
            <DetailField label="Completed At" value={formatDateTime(production.completedAt)} />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Product Lines</CardTitle>
        </CardHeader>
        <CardContent>
                      <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead className="min-w-[180px]">Product</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Quantity</TableHead>
                  <TableHead className="whitespace-nowrap">Unit</TableHead>
                  <TableHead className="hidden min-w-[160px] md:table-cell">Recipe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {production.lines.map((line, index) => (
                  <TableRow key={line.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>
                      {line.productCode} - {line.productName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(line.quantity)}
                    </TableCell>
                    <TableCell>{line.unit}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {line.recipeCode} v{line.recipeVersion}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
        </CardContent>
      </Card>

      <ProductionMaterialPreview
        rows={materialPreviewRows}
        isLoading={isPreviewLoading}
        hasValidLines={production.lines.length > 0}
      />

      <ConfirmDialog
        open={isDeleteOpen}
        onOpenChange={(open) => {
          if (isDeleting) {
            return;
          }

          setIsDeleteOpen(open);
        }}
        title="Delete production draft?"
        description={`This will soft-delete "${production.productionNumber}". It will no longer appear in active lists but historical data is preserved.`}
        confirmLabel="Delete"
        confirmVariant="destructive"
        loadingLabel="Deleting..."
        isLoading={isDeleting}
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={isCompleteOpen}
        onOpenChange={(open) => {
          if (isCompleting) {
            return;
          }

          setIsCompleteOpen(open);
        }}
        title="Complete Production"
        description={`Complete "${production.productionNumber}"? Raw materials will be deducted and ${formatQuantity(production.totalUnits)} units added to product stock. This cannot be undone.`}
        confirmLabel="Complete Production"
        loadingLabel="Completing..."
        isLoading={isCompleting}
        onConfirm={handleComplete}
      />
    </div>
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
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <div className="mt-1.5 text-sm">{value}</div>
    </div>
  );
}
