import type { FieldErrors } from 'react-hook-form';

import type { ReturnFormValues } from '@/lib/domain/schemas/return.schema';

export type ReturnFieldError = {
  field:
    | keyof ReturnFormValues
    | `lines.${number}.productId`
    | `lines.${number}.quantity`;
  message: string;
};

export function mapReturnActionError(code?: string): ReturnFieldError | null {
  void code;
  return null;
}

export function focusReturnLineField(index: number, field: 'productId' | 'quantity'): void {
  window.requestAnimationFrame(() => {
    const element = document.getElementById(`return-line-${index}-${field}`);

    if (element instanceof HTMLElement) {
      element.focus({ preventScroll: false });
    }
  });
}

export function focusReturnFormField(field: ReturnFieldError['field']): void {
  const lineMatch = /^lines\.(\d+)\.(productId|quantity)$/.exec(field);

  if (lineMatch?.[1] && lineMatch[2]) {
    focusReturnLineField(
      Number.parseInt(lineMatch[1], 10),
      lineMatch[2] as 'productId' | 'quantity',
    );
    return;
  }

  const element = document.getElementById(field);

  if (element instanceof HTMLElement) {
    element.focus();
  }
}

export function focusFirstReturnFormError(errors: FieldErrors<ReturnFormValues>): void {
  const headerFields = ['returnDate', 'reason', 'notes'] as const;

  for (const field of headerFields) {
    if (errors[field]) {
      focusReturnFormField(field);
      return;
    }
  }

  if (errors.lines?.message) {
    const firstLine = document.querySelector<HTMLElement>('[id^="return-line-0-"]');

    if (firstLine) {
      firstLine.focus();
    }

    return;
  }

  const lineErrors = errors.lines;

  if (!Array.isArray(lineErrors)) {
    return;
  }

  for (let index = 0; index < lineErrors.length; index += 1) {
    const lineError = lineErrors[index];

    if (!lineError) {
      continue;
    }

    if (lineError.productId) {
      focusReturnLineField(index, 'productId');
      return;
    }

    if (lineError.quantity) {
      focusReturnLineField(index, 'quantity');
      return;
    }
  }
}

export function getLocalReturnDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
