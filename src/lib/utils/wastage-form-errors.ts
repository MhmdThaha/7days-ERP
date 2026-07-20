import type { FieldErrors } from 'react-hook-form';

import type { WastageFormValues } from '@/lib/domain/schemas/wastage.schema';

export type WastageFieldError = {
  field:
    | keyof WastageFormValues
    | `lines.${number}.productId`
    | `lines.${number}.quantity`;
  message: string;
};

export function mapWastageActionError(code?: string): WastageFieldError | null {
  void code;
  return null;
}

export function focusWastageLineField(index: number, field: 'productId' | 'quantity'): void {
  window.requestAnimationFrame(() => {
    const element = document.getElementById(`wastage-line-${index}-${field}`);

    if (element instanceof HTMLElement) {
      element.focus({ preventScroll: false });
    }
  });
}

export function focusWastageFormField(field: WastageFieldError['field']): void {
  const lineMatch = /^lines\.(\d+)\.(productId|quantity)$/.exec(field);

  if (lineMatch?.[1] && lineMatch[2]) {
    focusWastageLineField(
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

export function focusFirstWastageFormError(errors: FieldErrors<WastageFormValues>): void {
  const headerFields = ['wastageDate', 'reason', 'notes'] as const;

  for (const field of headerFields) {
    if (errors[field]) {
      focusWastageFormField(field);
      return;
    }
  }

  if (errors.lines?.message) {
    const firstLine = document.querySelector<HTMLElement>('[id^="wastage-line-0-"]');

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
      focusWastageLineField(index, 'productId');
      return;
    }

    if (lineError.quantity) {
      focusWastageLineField(index, 'quantity');
      return;
    }
  }
}

export function getLocalWastageDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
