'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { getExpenseAction, updateExpenseAction } from '@/actions/expenses';
import { ExpenseForm } from '@/components/expenses/expense-form';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ExpenseFormValues } from '@/lib/domain/schemas/expense.schema';
import { mapExpenseActionError, type ExpenseFieldError } from '@/lib/utils/expense-form-errors';
import { invalidateDailyReportQueries, invalidateDashboardQueries, invalidateMonthlyReportQueries } from '@/lib/utils/query-invalidation';

const FORM_ID = 'expense-edit-form';

type ExpenseEditPageProps = {
  expenseId: string;
};

export function ExpenseEditPage({ expenseId }: ExpenseEditPageProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverFieldError, setServerFieldError] = useState<ExpenseFieldError | null>(null);

  const {
    data: expense,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['expense-entry', expenseId],
    queryFn: async () => {
      const result = await getExpenseAction(expenseId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
  });

  async function handleSubmit(values: ExpenseFormValues) {
    if (isSubmitting || !expense) {
      return;
    }

    setIsSubmitting(true);
    setServerFieldError(null);

    try {
      const result = await updateExpenseAction(expenseId, {
        expenseDate: values.expenseDate,
        category: values.category,
        amount: values.amount,
        notes: values.notes ?? null,
      });

      if (!result.success) {
        const fieldError = mapExpenseActionError(result.code);

        if (fieldError) {
          setServerFieldError(fieldError);
        }

        toast.error(result.error);
        return;
      }

      toast.success('Expense draft updated successfully');

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['expenses'] }),
        queryClient.invalidateQueries({ queryKey: ['expense-entry', expenseId] }),
        invalidateDashboardQueries(queryClient),
        invalidateDailyReportQueries(queryClient),
        invalidateMonthlyReportQueries(queryClient),
      ]);

      router.push(`/expenses/${expenseId}`);
    } finally {
      setIsSubmitting(false);
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
      <Alert variant="destructive">
        <AlertTitle>Expense not found</AlertTitle>
        <AlertDescription>
          {error?.message ?? 'The requested expense could not be loaded.'}
        </AlertDescription>
      </Alert>
    );
  }

  if (expense.status !== 'draft') {
    return (
      <Alert variant="destructive">
        <AlertTitle>Cannot edit expense</AlertTitle>
        <AlertDescription>Only draft expenses can be edited.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button
          nativeButton={false}
          variant="ghost"
          size="sm"
          render={<Link href={`/expenses/${expenseId}`} />}
        >
          <ArrowLeft />
          Back to Expense
        </Button>
      </div>

      <PageHeader
        title="Edit Expense"
        description={`Update draft expense ${expense.expenseNumber}.`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Expense Details</CardTitle>
        </CardHeader>
        <CardContent>
          <ExpenseForm
            formId={FORM_ID}
            expense={expense}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            serverFieldError={serverFieldError}
            onServerFieldErrorHandled={() => setServerFieldError(null)}
          />
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          nativeButton={false}
          variant="outline"
          render={<Link href={`/expenses/${expenseId}`} />}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" form={FORM_ID} disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
