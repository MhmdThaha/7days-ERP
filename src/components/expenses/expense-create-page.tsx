'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';

import { completeExpenseAction, createExpenseAction } from '@/actions/expenses';
import { ExpenseForm } from '@/components/expenses/expense-form';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ExpenseFormValues } from '@/lib/domain/schemas/expense.schema';
import { toastFormError } from '@/lib/utils/toast-form-error';
import { mapExpenseActionError, type ExpenseFieldError } from '@/lib/utils/expense-form-errors';
import { invalidateDailyReportQueries, invalidateDashboardQueries, invalidateMonthlyReportQueries } from '@/lib/utils/query-invalidation';
import { toastDraftSaved, toastWorkflowComplete } from '@/lib/utils/workflow-toasts';

const FORM_ID = 'expense-create-form';

export function ExpenseCreatePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverFieldError, setServerFieldError] = useState<ExpenseFieldError | null>(null);

  async function handleSubmit(values: ExpenseFormValues) {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setServerFieldError(null);

    try {
      const result = await createExpenseAction({
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

        toastFormError(result.error);
        return;
      }

      const expenseId = result.data.id;

      toastDraftSaved('Expense saved as draft', 'Complete expense', () => {
        void (async () => {
          const completeResult = await completeExpenseAction(expenseId);

          if (!completeResult.success) {
            toastFormError(completeResult.error);
            return;
          }

          toastWorkflowComplete('Expense completed and recorded in reports.', {
            recordAnother: {
              label: 'Record another',
              onClick: () => router.push('/expenses/new'),
            },
          });

          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['expenses'] }),
            queryClient.invalidateQueries({ queryKey: ['expense-entry', expenseId] }),
            invalidateDashboardQueries(queryClient),
            invalidateDailyReportQueries(queryClient),
            invalidateMonthlyReportQueries(queryClient),
          ]);
        })();
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['expenses'] }),
        invalidateDashboardQueries(queryClient),
        invalidateDailyReportQueries(queryClient),
        invalidateMonthlyReportQueries(queryClient),
      ]);

      router.push(`/expenses/${expenseId}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/expenses" />}>
          <ArrowLeft />
          Back to Expenses
        </Button>
      </div>

      <PageHeader
        title="Record Expense"
        description="Enter the expense details. This saves a draft only — accounting entries are not created yet."
      />

      <Card>
        <CardHeader>
          <CardTitle>Expense Details</CardTitle>
        </CardHeader>
        <CardContent>
          <ExpenseForm
            formId={FORM_ID}
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
          render={<Link href="/expenses" />}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" form={FORM_ID} disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save Draft'}
        </Button>
      </div>
    </div>
  );
}
