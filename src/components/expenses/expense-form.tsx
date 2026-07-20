'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { MoneyInput } from '@/components/shared/money-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
} from '@/lib/domain/constants/expense';
import { expenseFormSchema, type ExpenseFormValues } from '@/lib/domain/schemas/expense.schema';
import {
  focusExpenseFormField,
  focusFirstExpenseFormError,
  getLocalExpenseDateString,
  type ExpenseFieldError,
} from '@/lib/utils/expense-form-errors';
import type { Expense } from '@/types/expense';

type ExpenseFormProps = {
  expense?: Expense;
  onSubmit: (values: ExpenseFormValues) => Promise<void>;
  isSubmitting?: boolean;
  formId: string;
  serverFieldError?: ExpenseFieldError | null;
  onServerFieldErrorHandled?: () => void;
};

const defaultValues: ExpenseFormValues = {
  expenseDate: getLocalExpenseDateString(),
  category: 'rent',
  amount: 0,
  notes: '',
};

const categorySelectItems = EXPENSE_CATEGORIES.map((category) => ({
  value: category,
  label: EXPENSE_CATEGORY_LABELS[category],
}));

export function ExpenseForm({
  expense,
  onSubmit,
  isSubmitting = false,
  formId,
  serverFieldError,
  onServerFieldErrorHandled,
}: ExpenseFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    trigger,
    watch,
    reset,
    formState: { errors },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues,
  });

  const category = watch('category');
  const amount = watch('amount');

  useEffect(() => {
    if (expense) {
      reset({
        expenseDate: expense.expenseDate,
        category: expense.category,
        amount: expense.amount,
        notes: expense.notes ?? '',
      });
      return;
    }

    reset(defaultValues);
  }, [expense, reset]);

  useEffect(() => {
    if (!serverFieldError) {
      return;
    }

    setError(serverFieldError.field, { type: 'server', message: serverFieldError.message });
    focusExpenseFormField(serverFieldError.field);
    onServerFieldErrorHandled?.();
  }, [serverFieldError, setError, onServerFieldErrorHandled]);

  return (
    <form
      id={formId}
      className="space-y-5"
      onSubmit={handleSubmit(onSubmit, focusFirstExpenseFormError)}
      noValidate
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="expenseDate">Expense Date *</Label>
          <Input
            id="expenseDate"
            type="date"
            aria-invalid={!!errors.expenseDate}
            aria-describedby={errors.expenseDate ? 'expenseDate-error' : undefined}
            disabled={isSubmitting}
            {...register('expenseDate')}
          />
          {errors.expenseDate ? (
            <p id="expenseDate-error" className="text-sm text-destructive" role="alert">
              {errors.expenseDate.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="category">Category *</Label>
          <Select
            value={category}
            onValueChange={(value) =>
              setValue('category', value ?? 'rent', { shouldValidate: true })
            }
            disabled={isSubmitting}
          >
            <SelectTrigger
              id="category"
              className="w-full"
              aria-invalid={!!errors.category}
              aria-describedby={errors.category ? 'category-error' : undefined}
            >
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categorySelectItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.category ? (
            <p id="category-error" className="text-sm text-destructive" role="alert">
              {errors.category.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2 sm:max-w-xs">
        <Label htmlFor="amount">Amount *</Label>
        <MoneyInput
          id="amount"
          value={amount}
          onChange={(nextValue) =>
            setValue('amount', nextValue, { shouldValidate: false, shouldDirty: true })
          }
          onBlur={() => {
            void trigger('amount');
          }}
          disabled={isSubmitting}
          aria-invalid={!!errors.amount}
          aria-describedby={errors.amount ? 'amount-error' : undefined}
        />
        {errors.amount ? (
          <p id="amount-error" className="text-sm text-destructive" role="alert">
            {errors.amount.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          placeholder="Optional notes about this expense"
          rows={3}
          aria-invalid={!!errors.notes}
          aria-describedby={errors.notes ? 'notes-error' : undefined}
          disabled={isSubmitting}
          className="resize-none"
          {...register('notes')}
        />
        {errors.notes ? (
          <p id="notes-error" className="text-sm text-destructive" role="alert">
            {errors.notes.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
