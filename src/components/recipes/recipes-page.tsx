'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, SearchX } from 'lucide-react';
import { toast } from 'sonner';

import { deleteRecipeAction } from '@/actions/recipes';
import { RecipeFilters } from '@/components/recipes/recipe-filters';
import { RecipeProductionReadiness } from '@/components/recipes/recipe-production-readiness';
import { RecipeTable } from '@/components/recipes/recipe-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DataTablePagination } from '@/components/shared/data-table-pagination';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadErrorAlert } from '@/components/shared/load-error-alert';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { RECIPE_PAGE_SIZE } from '@/lib/domain/constants/recipe';
import { useProducts } from '@/hooks/queries/use-products';
import { useRecipes } from '@/hooks/queries/use-recipes';
import { toastFormError } from '@/lib/utils/toast-form-error';
import type { RecipeListItem, RecipeStatusFilter } from '@/types/recipe';

function getRecipeListSummary(status: RecipeStatusFilter, total: number): string {
  if (status === 'active') {
    return total === 1 ? '1 active recipe' : `${total.toLocaleString('en-IN')} active recipes`;
  }

  if (status === 'inactive') {
    return total === 1 ? '1 inactive recipe' : `${total.toLocaleString('en-IN')} inactive recipes`;
  }

  return total === 1 ? '1 recipe' : `${total.toLocaleString('en-IN')} recipes`;
}

export function RecipesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<RecipeStatusFilter>('active');
  const [page, setPage] = useState(1);
  const [deletingRecipe, setDeletingRecipe] = useState<RecipeListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isFetching, error, refetch, isRefetching } = useRecipes({
    search: debouncedSearch,
    status,
    page,
    pageSize: RECIPE_PAGE_SIZE,
  });

  const { data: recipeCatalogMeta, isLoading: isRecipeCatalogMetaLoading } = useRecipes({
    search: '',
    status: 'all',
    page: 1,
    pageSize: 1,
  });

  const recipeCatalogFetchSize = Math.max(recipeCatalogMeta?.total ?? 0, 1);

  const { data: recipeCatalogData, isLoading: isRecipeCatalogLoading } = useRecipes({
    search: '',
    status: 'all',
    page: 1,
    pageSize: recipeCatalogFetchSize,
  });

  const { data: productCatalogMeta, isLoading: isProductCatalogMetaLoading } = useProducts({
    search: '',
    status: 'active',
    page: 1,
    pageSize: 1,
  });

  const productCatalogFetchSize = Math.max(productCatalogMeta?.total ?? 0, 1);

  const { data: productCatalogData, isLoading: isProductCatalogLoading } = useProducts({
    search: '',
    status: 'active',
    page: 1,
    pageSize: productCatalogFetchSize,
  });

  const productionReadiness = useMemo(() => {
    const recipes = recipeCatalogData?.items ?? [];
    const products = productCatalogData?.items ?? [];

    return {
      readyCount: recipes.filter((recipe) => recipe.isActive).length,
      inactiveCount: recipes.filter((recipe) => !recipe.isActive).length,
      needRecipeCount: products.filter((product) => !product.activeRecipeId).length,
    };
  }, [recipeCatalogData, productCatalogData]);

  const isSearching = search !== debouncedSearch;
  const hasActiveFilters = Boolean(debouncedSearch.trim()) || status !== 'active';
  const showEmptyCatalog = !isLoading && !error && data?.total === 0 && !hasActiveFilters;
  const showNoResults = !isLoading && !error && data?.total === 0 && hasActiveFilters;
  const isOrgError = error?.message.includes('Organization context is not configured');
  const showProductionReadiness = !showEmptyCatalog && !isOrgError;
  const isReadinessLoading =
    isRecipeCatalogMetaLoading ||
    isRecipeCatalogLoading ||
    isProductCatalogMetaLoading ||
    isProductCatalogLoading;

  function clearFilters() {
    setSearch('');
    setDebouncedSearch('');
    setStatus('active');
    setPage(1);
  }

  async function handleDelete() {
    if (!deletingRecipe || isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      const result = await deleteRecipeAction(deletingRecipe.id);

      if (!result.success) {
        toastFormError(result.error);
        return;
      }

      toast.success('Recipe deleted successfully');
      setDeletingRecipe(null);

      if (data?.items.length === 1 && page > 1) {
        setPage((currentPage) => currentPage - 1);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['recipes'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
      ]);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Recipes" description="Define how finished products are made from raw materials.">
        {!showEmptyCatalog ? (
          <Button nativeButton={false} variant="success" size="xl" render={<Link href="/recipes/new" />}>
            <Plus />
            Add Recipe
          </Button>
        ) : null}
      </PageHeader>

      {showProductionReadiness ? (
        <RecipeProductionReadiness
          readyCount={productionReadiness.readyCount}
          needRecipeCount={productionReadiness.needRecipeCount}
          inactiveCount={productionReadiness.inactiveCount}
          isLoading={isReadinessLoading}
        />
      ) : null}

      {isOrgError ? (
        <Alert variant="destructive">
          <AlertTitle>Configuration required</AlertTitle>
          <AlertDescription>
            Set <code className="font-mono text-sm">DEV_ORG_ID</code> in your{' '}
            <code className="font-mono text-sm">.env.local</code> file to connect to Firestore.
          </AlertDescription>
        </Alert>
      ) : null}

      <RecipeFilters
        search={search}
        status={status}
        isSearching={isSearching}
        disabled={isLoading || isDeleting}
        onSearchChange={setSearch}
        onStatusChange={(value) => {
          setStatus(value);
          setPage(1);
        }}
      />

      {error && !isOrgError ? (
        <LoadErrorAlert
          title="Failed to load recipes"
          error={error}
          onRetry={() => void refetch()}
          isRetrying={isRefetching}
        />
      ) : null}

      {showEmptyCatalog ? (
        <EmptyState
          title="No recipes yet"
          description="Create your first recipe to link products with their raw material ingredients."
          actionLabel="Add Recipe"
          onAction={() => router.push('/recipes/new')}
        />
      ) : showNoResults ? (
        <EmptyState
          icon={SearchX}
          title="No matching records."
          description="Try clearing your filters to see all recipes."
          actionLabel="Clear Filters"
          onAction={clearFilters}
        />
      ) : (
        <>
          {data && data.total > 0 ? (
            <div
              className="rounded-lg border bg-muted/30 px-4 py-3 text-base font-medium text-muted-foreground"
              role="status"
            >
              {getRecipeListSummary(status, data.total)}
            </div>
          ) : null}

          <RecipeTable
            recipes={data?.items ?? []}
            isLoading={isLoading}
            isFetching={isFetching}
            disabled={isDeleting}
            onEdit={(recipeId) => router.push(`/recipes/${recipeId}/edit`)}
            onDelete={(recipe) => setDeletingRecipe(recipe)}
          />

          {data && data.total > 0 ? (
            <DataTablePagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              pageSize={data.pageSize}
              entityName="recipes"
              disabled={isFetching || isDeleting}
              onPageChange={setPage}
            />
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={Boolean(deletingRecipe)}
        onOpenChange={(open) => {
          if (isDeleting) {
            return;
          }

          if (!open) {
            setDeletingRecipe(null);
          }
        }}
        title="Delete recipe?"
        description={
          deletingRecipe
            ? `This will soft-delete "${deletingRecipe.recipeName}". The linked product will no longer show a recipe badge.`
            : ''
        }
        confirmLabel="Delete"
        confirmVariant="destructive"
        loadingLabel="Deleting..."
        isLoading={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
