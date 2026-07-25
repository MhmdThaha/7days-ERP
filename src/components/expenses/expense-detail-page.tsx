'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { completeExpenseAction, deleteExpenseAction, getExpenseAction } from '@/actions/expenses';
import { ExpenseStatusBadge } from '@/components/expenses/expense-status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DraftActionBanner } from '@/components/shared/draft-action-banner';
import { MoneyDisplay } from '@/components/shared/money-display';
import { LoadErrorAlert } from '@/components/shared/load-error-alert';
import { PageHeader } from '@/components/shared/page-header';
import { TruncatedText } from '@/components/shared/truncated-text';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EXPENSE_CATEGORY_LABELS } from '@/lib/domain/constants/expense';
import { toastFormError } from '@/lib/utils/toast-form-error';
import { invalidateDailyReportQueries, invalidateDashboardQueries, invalidateMonthlyReportQueries } from '@/lib/utils/query-invalidation';
import { toastWorkflowComplete } from '@/lib/utils/workflow-toasts';

type ExpenseDetailPageProps = {
  expenseId: string;
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

export function ExpenseDetailPage({ expenseId }: ExpenseDetailPageProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isCompleteOpen, setIsCompleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const { data: expense, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['expense-entry', expenseId],
    queryFn: async () => {
      const result = await getExpenseAction(expenseId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
  });

  async function invalidateExpenseQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['expenses'] }),
      queryClient.invalidateQueries({ queryKey: ['expense-entry', expenseId] }),
      invalidateDashboardQueries(queryClient),
      invalidateDailyReportQueries(queryClient),
      invalidateMonthlyReportQueries(queryClient),
    ]);
  }

  async function handleComplete() {
    if (isCompleting) {
      return;
    }

    setIsCompleting(true);

    try {
      const result = await completeExpenseAction(expenseId);

      if (!result.success) {
        toastFormError(result.error);
        return;
      }

      toastWorkflowComplete('Expense completed and recorded in reports.', {
        recordAnother: {
          label: 'Record another',
          onClick: () => router.push('/expenses/new'),
        },
      });
      setIsCompleteOpen(false);

      await invalidateExpenseQueries();
    } finally {
      setIsCompleting(false);
    }
  }

  async function handleDelete() {
    if (isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      const result = await deleteExpenseAction(expenseId);

      if (!result.success) {
        toastFormError(result.error);
        return;
      }

      toast.success('Expense draft deleted successfully');
      setIsDeleteOpen(false);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['expenses'] }),
        invalidateDashboardQueries(queryClient),
        invalidateDailyReportQueries(queryClient),
        invalidateMonthlyReportQueries(queryClient),
      ]);

      router.push('/expenses');
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading expense">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !expense) {
    return (
      <div className="space-y-4">
        <LoadErrorAlert
          title="Unable to load expense"
          error={error}
          onRetry={() => void refetch()}
          isRetrying={isRefetching}
        />
        {!error ? (
          <Alert variant="destructive">
            <AlertTitle>Expense not found</AlertTitle>
            <AlertDescription>The requested expense could not be loaded.</AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }

  const canEdit = expense.status === 'draft';
  const isBusy = isDeleting || isCompleting;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/expenses" />}>
          <ArrowLeft />
          Back to Expenses
        </Button>
      </div>

      <PageHeader
        title={
          <TruncatedText
            text={expense.expenseNumber}
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
              render={<Link href={`/expenses/${expenseId}/edit`} />}
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
          title="Draft expense — not recorded yet"
          description="Complete this expense to include it in daily and monthly reports."
          actionLabel="Complete Expense"
          onAction={() => setIsCompleteOpen(true)}
          icon={CheckCircle2}
          disabled={isBusy}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Expense Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <DetailField label="Expense Date" value={formatDate(expense.expenseDate)} />
          <DetailField label="Status" value={<ExpenseStatusBadge status={expense.status} />} />
          <DetailField label="Category" value={EXPENSE_CATEGORY_LABELS[expense.category]} />
          <DetailField
            label="Amount"
            value={<MoneyDisplay amount={expense.amount} className="font-medium" />}
          />
          <DetailField
            label="Notes"
            value={
              <span className="break-words whitespace-pre-wrap">{expense.notes ?? '—'}</span>
            }
            className="sm:col-span-2"
          />
          <DetailField label="Created At" value={formatDateTime(expense.createdAt)} />
          <DetailField label="Updated At" value={formatDateTime(expense.updatedAt)} />
          {expense.completedAt ? (
            <DetailField label="Completed At" value={formatDateTime(expense.completedAt)} />
          ) : null}
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
        title="Delete expense draft?"
        description={`This will soft-delete "${expense.expenseNumber}". It will no longer appear in active lists but historical data is preserved.`}
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
        title="Complete Expense"
        description={`Complete "${expense.expenseNumber}"? This ${EXPENSE_CATEGORY_LABELS[expense.category].toLowerCase()} expense will be included in reports. This cannot be undone.`}
        confirmLabel="Complete Expense"
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
