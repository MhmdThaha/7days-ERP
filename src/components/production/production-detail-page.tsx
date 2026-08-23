'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Info, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  completeProductionAction,
  deleteProductionAction,
  getProductionAction,
  getProductionConsumedMaterialsAction,
} from '@/actions/production';
import { useAuth } from '@/hooks/use-auth';
import { ProductionDetailSummary } from '@/components/production/production-detail-summary';
import { ProductionMaterialPreview } from '@/components/production/production-material-preview';
import { ProductionStatusBadge } from '@/components/production/production-status-badge';
import { RecipeChangedDialog } from '@/components/production/recipe-changed-dialog';
import { useDraftRecipeVersionCheck } from '@/components/production/use-draft-recipe-version-check';
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
  PRODUCTION_PREVIEW_STALE_TIME,
  fetchProductionPreviewPipeline,
} from '@/lib/utils/production-preview-cache';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { buildMaterialPreview } from '@/lib/domain/calculations/production-materials';
import { formatProductionQuantityDisplay } from '@/lib/utils/production-quantity-display';
import { toastFormError } from '@/lib/utils/toast-form-error';
import {
  invalidateDailyReportQueries,
  invalidateDashboardQueries,
  invalidateInventoryStockQueries,
  invalidateMonthlyReportQueries,
} from '@/lib/utils/query-invalidation';
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
  return formatProductionQuantityDisplay(value);
}

export function ProductionDetailPage({ productionId }: ProductionDetailPageProps) {
  const { user, isAuthenticated } = useAuth();
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
    enabled: isAuthenticated,
  });

  const isCompleted = production?.status === 'completed';
  const isDraft = production?.status === 'draft';

  const recipeIds = useMemo(
    () => [...new Set((production?.lines ?? []).map((line) => line.recipeId))].sort(),
    [production?.lines],
  );

  const { data: recipes, isLoading: isLoadingRecipes } = useQuery({
    queryKey: ['recipes', 'production-detail', recipeIds],
    enabled: isAuthenticated && isDraft && recipeIds.length > 0,
    queryFn: () => fetchProductionPreviewPipeline(queryClient, user?.uid, recipeIds),
    staleTime: PRODUCTION_PREVIEW_STALE_TIME,
  });

  const { data: consumedMaterials, isLoading: isLoadingConsumedMaterials } = useQuery({
    queryKey: ['production', productionId, 'consumed-materials'],
    enabled: isAuthenticated && isCompleted,
    queryFn: async () => {
      const result = await getProductionConsumedMaterialsAction(productionId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
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

    if (isCompleted) {
      return consumedMaterials ?? [];
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
  }, [production, isCompleted, consumedMaterials, recipesById, rawMaterialsById]);

  const {
    dialogOpen: recipeChangedDialogOpen,
    isUpdatingDraft: isUpdatingDraftRecipe,
    handleUpdateDraft,
    handleContinueWithCurrentDraft,
    handleClose: handleCloseRecipeChangedDialog,
    setDialogOpen: setRecipeChangedDialogOpen,
  } = useDraftRecipeVersionCheck({
    production,
    productionId,
    isAuthenticated,
    queryClient,
  });

  async function invalidateProductionQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['productions'] }),
      queryClient.invalidateQueries({ queryKey: ['production', productionId] }),
      invalidateInventoryStockQueries(queryClient),
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
  const isPreviewLoading = isCompleted
    ? isLoadingConsumedMaterials
    : isLoadingRecipes || isLoadingRawMaterials;
  const ingredientShortageCount = materialPreviewRows.filter((row) => row.shortage > 0).length;
  const headerSubtitle = `${formatDate(production.productionDate)} · ${formatQuantity(production.totalUnits)} units · ${production.lineCount} product${production.lineCount === 1 ? '' : 's'}`;

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
          <div className="flex flex-wrap items-center gap-3">
            <TruncatedText
              text={production.productionNumber}
              maxWidthClassName="max-w-[min(100%,480px)]"
              className="text-left font-heading text-2xl font-semibold tracking-tight"
            />
            <ProductionStatusBadge status={production.status} />
          </div>
        }
        description={headerSubtitle}
      >
        {canEdit ? (
          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              variant="success"
              size="xl"
              className="w-full min-h-12 sm:w-auto"
              onClick={() => setIsCompleteOpen(true)}
              disabled={isBusy || (!isPreviewLoading && ingredientShortageCount > 0)}
            >
              <CheckCircle2 />
              Finish Production
            </Button>
            <Button
              nativeButton={false}
              variant="outline"
              className="w-full min-h-11 sm:w-auto"
              render={<Link href={`/production/${productionId}/edit`} />}
              disabled={isBusy}
            >
              <Pencil />
              Edit
            </Button>
            <Button
              variant="outline"
              className="w-full min-h-11 border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive sm:w-auto"
              onClick={() => setIsDeleteOpen(true)}
              disabled={isBusy}
            >
              <Trash2 />
              Delete
            </Button>
          </div>
        ) : null}
      </PageHeader>

      {canEdit ? (
        <DraftActionBanner
          title="Stock not updated yet"
          description="Review the ingredients below, then press Finish Production at the top to update stock."
          icon={Info}
          alertVariant="default"
          showAction={false}
        />
      ) : null}

      <ProductionDetailSummary
        productionDateLabel={formatDate(production.productionDate)}
        totalUnitsLabel={formatQuantity(production.totalUnits)}
        productLineCount={production.lineCount}
        isDraft={isDraft}
        isPreviewLoading={isDraft ? isPreviewLoading : false}
        shortageCount={ingredientShortageCount}
      />

      <Card>
        <CardHeader>
          <CardTitle>Production Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <DetailField label="Production date" value={formatDate(production.productionDate)} />
          <DetailField
            label="Total units"
            value={<span className="font-medium tabular-nums">{formatQuantity(production.totalUnits)}</span>}
          />
          <DetailField label="Product lines" value={production.lineCount} />
          <DetailField
            label="Notes"
            value={
              <span className="break-words whitespace-pre-wrap">{production.notes ?? '—'}</span>
            }
            className="sm:col-span-2"
          />
          <DetailField label="Created" value={formatDateTime(production.createdAt)} />
          <DetailField label="Updated" value={formatDateTime(production.updatedAt)} />
          {production.completedAt ? (
            <DetailField label="Finished" value={formatDateTime(production.completedAt)} />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Product Lines</CardTitle>
        </CardHeader>
        <CardContent>
          <Table className="text-base">
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 normal-case text-sm font-medium tracking-normal">#</TableHead>
                <TableHead className="min-w-[180px] normal-case text-sm font-medium tracking-normal">
                  Product
                </TableHead>
                <TableHead className="text-right whitespace-nowrap normal-case text-sm font-medium tracking-normal">
                  Quantity
                </TableHead>
                <TableHead className="whitespace-nowrap normal-case text-sm font-medium tracking-normal">
                  Unit
                </TableHead>
                <TableHead className="hidden min-w-[160px] normal-case text-sm font-medium tracking-normal md:table-cell">
                  Recipe
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {production.lines.map((line, index) => (
                <TableRow key={line.id}>
                  <TableCell className="py-4">{index + 1}</TableCell>
                  <TableCell className="py-4">
                    {line.productCode} - {line.productName}
                  </TableCell>
                  <TableCell className="py-4 text-right tabular-nums">
                    {formatQuantity(line.quantity)}
                  </TableCell>
                  <TableCell className="py-4">{line.unit}</TableCell>
                  <TableCell className="hidden py-4 md:table-cell">
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
        mode={isCompleted ? 'completed' : 'draft'}
        comfortableTable
      />

      {isDraft ? (
        <RecipeChangedDialog
          open={recipeChangedDialogOpen}
          onOpenChange={setRecipeChangedDialogOpen}
          isUpdating={isUpdatingDraftRecipe}
          onUpdateDraft={() => void handleUpdateDraft()}
          onContinueWithCurrentDraft={handleContinueWithCurrentDraft}
          onClose={handleCloseRecipeChangedDialog}
        />
      ) : null}

      <ConfirmDialog
        open={isDeleteOpen}
        onOpenChange={(open) => {
          if (isDeleting) {
            return;
          }

          setIsDeleteOpen(open);
        }}
        title="Delete this draft?"
        description={`Remove "${production.productionNumber}" from your list. Finished productions stay safe.`}
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
        title="Finish Production"
        description={`Finish "${production.productionNumber}"? Ingredients will be taken from stock and ${formatQuantity(production.totalUnits)} finished products will be added. This cannot be undone.`}
        confirmLabel="Finish Production"
        confirmVariant="success"
        loadingLabel="Finishing..."
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
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <div className="mt-1.5 text-base">{value}</div>
    </div>
  );
}
