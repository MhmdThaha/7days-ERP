import type { FieldErrors } from 'react-hook-form';

import type { ExpenseFormValues } from '@/lib/domain/schemas/expense.schema';

export type ExpenseFieldError = {
  field: keyof ExpenseFormValues;
  message: string;
};

export function mapExpenseActionError(code?: string): ExpenseFieldError | null {
  void code;
  return null;
}

export function focusExpenseFormField(field: ExpenseFieldError['field']): void {
  const element = document.getElementById(field);

  if (element instanceof HTMLElement) {
    element.focus();
  }
}

export function focusFirstExpenseFormError(errors: FieldErrors<ExpenseFormValues>): void {
  const fields = ['expenseDate', 'category', 'amount', 'notes'] as const;

  for (const field of fields) {
    if (errors[field]) {
      focusExpenseFormField(field);
      return;
    }
  }
}

export function getLocalExpenseDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
