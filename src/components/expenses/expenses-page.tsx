'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, SearchX } from 'lucide-react';
import { toast } from 'sonner';

import { completeExpenseAction, deleteExpenseAction } from '@/actions/expenses';
import { ExpenseFilters } from '@/components/expenses/expense-filters';
import { ExpenseTable } from '@/components/expenses/expense-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DataTablePagination } from '@/components/shared/data-table-pagination';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadErrorAlert } from '@/components/shared/load-error-alert';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EXPENSE_CATEGORY_LABELS, EXPENSE_PAGE_SIZE } from '@/lib/domain/constants/expense';
import { useExpenses } from '@/hooks/queries/use-expenses';
import { invalidateDailyReportQueries, invalidateDashboardQueries, invalidateMonthlyReportQueries } from '@/lib/utils/query-invalidation';
import { clearModuleWorkflowResumeForRecord } from '@/lib/navigation/module-workflow-resume';
import { useStatusFilterFromSearchParams } from '@/lib/utils/list-url-filters';
import { toastFormError } from '@/lib/utils/toast-form-error';
import { toastWorkflowComplete } from '@/lib/utils/workflow-toasts';
import type { ExpenseCategory, ExpenseListItem } from '@/types/expense';

export function ExpensesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState<ExpenseCategory | 'all'>('all');
  const [page, setPage] = useState(1);
  const resetPage = useCallback(() => setPage(1), []);
  const [status, setStatus] = useStatusFilterFromSearchParams(
    searchParams,
    ['all', 'draft', 'completed'],
    'all',
    resetPage,
  );
  const [deletingExpense, setDeletingExpense] = useState<ExpenseListItem | null>(null);
  const [completingExpense, setCompletingExpense] = useState<ExpenseListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isFetching, error, refetch, isRefetching } = useExpenses({
    search: debouncedSearch,
    category,
    status,
    page,
    pageSize: EXPENSE_PAGE_SIZE,
  });

  const isSearching = search !== debouncedSearch;
  const hasActiveFilters =
    Boolean(debouncedSearch.trim()) || category !== 'all' || status !== 'all';
  const showEmptyCatalog = !isLoading && !error && data?.total === 0 && !hasActiveFilters;
  const showNoResults = !isLoading && !error && data?.total === 0 && hasActiveFilters;
  const isOrgError = error?.message.includes('Organization context is not configured');
  const isBusy = isDeleting || isCompleting;

  function clearFilters() {
    setSearch('');
    setDebouncedSearch('');
    setCategory('all');
    setStatus('all');
    setPage(1);
  }

  async function handleDelete() {
    if (!deletingExpense || isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      const result = await deleteExpenseAction(deletingExpense.id);

      if (!result.success) {
        toastFormError(result.error);
        return;
      }

      clearModuleWorkflowResumeForRecord('expenses', deletingExpense.id);
      toast.success('Expense draft deleted successfully');
      setDeletingExpense(null);

      if (data?.items.length === 1 && page > 1) {
        setPage((currentPage) => currentPage - 1);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['expenses'] }),
        invalidateDashboardQueries(queryClient),
        invalidateDailyReportQueries(queryClient),
        invalidateMonthlyReportQueries(queryClient),
      ]);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleComplete() {
    if (!completingExpense || isCompleting) {
      return;
    }

    setIsCompleting(true);

    try {
      const result = await completeExpenseAction(completingExpense.id);

      if (!result.success) {
        toastFormError(result.error);
        return;
      }

      clearModuleWorkflowResumeForRecord('expenses', completingExpense.id);
      toastWorkflowComplete('Expense completed and recorded in reports.', {
        recordAnother: {
          label: 'Record another',
          onClick: () => router.push('/expenses/new'),
        },
      });
      setCompletingExpense(null);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['expenses'] }),
        queryClient.invalidateQueries({ queryKey: ['expense-entry', completingExpense.id] }),
        invalidateDashboardQueries(queryClient),
        invalidateDailyReportQueries(queryClient),
        invalidateMonthlyReportQueries(queryClient),
      ]);
    } finally {
      setIsCompleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="Record expense drafts for rent, utilities, salaries, and other operating costs."
      >
        {!showEmptyCatalog ? (
          <Button nativeButton={false} render={<Link href="/expenses/new" />}>
            <Plus />
            Record Expense
          </Button>
        ) : null}
      </PageHeader>

      {isOrgError ? (
        <Alert variant="destructive">
          <AlertTitle>Configuration required</AlertTitle>
          <AlertDescription>
            Set <code className="font-mono text-sm">DEV_ORG_ID</code> in your{' '}
            <code className="font-mono text-sm">.env.local</code> file to connect to Firestore.
          </AlertDescription>
        </Alert>
      ) : null}

      <ExpenseFilters
        search={search}
        category={category}
        status={status}
        isSearching={isSearching}
        disabled={isLoading || isBusy}
        onSearchChange={setSearch}
        onCategoryChange={(value) => {
          setCategory(value);
          setPage(1);
        }}
        onStatusChange={(value) => {
          setStatus(value);
          setPage(1);
        }}
      />

      {error && !isOrgError ? (
        <LoadErrorAlert
          title="Failed to load expenses"
          error={error}
          onRetry={() => void refetch()}
          isRetrying={isRefetching}
        />
      ) : null}

      {showEmptyCatalog ? (
        <EmptyState
          title="No expense drafts yet"
          description="Record your first expense to track operating costs."
          actionLabel="Record Expense"
          onAction={() => router.push('/expenses/new')}
        />
      ) : (
        <>
          {showNoResults ? (
            <EmptyState
              icon={SearchX}
              title="No matching records."
              description="Try clearing your filters to see all expenses."
              actionLabel="Clear Filters"
              onAction={clearFilters}
            />
          ) : (
            <ExpenseTable
              expenses={data?.items ?? []}
              isLoading={isLoading}
              isFetching={isFetching}
              disabled={isBusy}
              onDelete={(expense) => setDeletingExpense(expense)}
              onComplete={(expense) => setCompletingExpense(expense)}
            />
          )}

          {data && data.total > 0 ? (
            <DataTablePagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              pageSize={data.pageSize}
              entityName="expenses"
              disabled={isFetching || isBusy}
              onPageChange={setPage}
            />
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={Boolean(deletingExpense)}
        onOpenChange={(open) => {
          if (isDeleting) {
            return;
          }

          if (!open) {
            setDeletingExpense(null);
          }
        }}
        title="Delete expense draft?"
        description={
          deletingExpense
            ? `This will soft-delete "${deletingExpense.expenseNumber}". It will no longer appear in active lists but historical data is preserved.`
            : ''
        }
        confirmLabel="Delete"
        confirmVariant="destructive"
        loadingLabel="Deleting..."
        isLoading={isDeleting}
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={Boolean(completingExpense)}
        onOpenChange={(open) => {
          if (isCompleting) {
            return;
          }

          if (!open) {
            setCompletingExpense(null);
          }
        }}
        title="Complete Expense"
        description={
          completingExpense
            ? `Complete "${completingExpense.expenseNumber}"? This ${EXPENSE_CATEGORY_LABELS[completingExpense.category].toLowerCase()} expense will be included in reports. This cannot be undone.`
            : ''
        }
        confirmLabel="Complete Expense"
        loadingLabel="Completing..."
        isLoading={isCompleting}
        onConfirm={handleComplete}
      />
    </div>
  );
}
