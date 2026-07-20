import type { FieldErrors } from 'react-hook-form';

import type { ProductionFormValues } from '@/lib/domain/schemas/production.schema';

export type ProductionFieldError = {
  field:
    | keyof ProductionFormValues
    | `lines.${number}.productId`
    | `lines.${number}.quantity`;
  message: string;
};

export function mapProductionActionError(code?: string): ProductionFieldError | null {
  void code;
  return null;
}

export function focusProductionLineField(
  index: number,
  field: 'productId' | 'quantity',
): void {
  window.requestAnimationFrame(() => {
    const element = document.getElementById(`production-line-${index}-${field}`);

    if (element instanceof HTMLElement) {
      element.focus({ preventScroll: false });
    }
  });
}

export function focusProductionFormField(field: ProductionFieldError['field']): void {
  const lineMatch = /^lines\.(\d+)\.(productId|quantity)$/.exec(field);

  if (lineMatch?.[1] && lineMatch[2]) {
    focusProductionLineField(
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

export function focusFirstProductionFormError(errors: FieldErrors<ProductionFormValues>): void {
  const headerFields = ['productionDate', 'notes'] as const;

  for (const field of headerFields) {
    if (errors[field]) {
      focusProductionFormField(field);
      return;
    }
  }

  if (errors.lines?.message) {
    const firstLine = document.querySelector<HTMLElement>('[id^="production-line-0-"]');

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
    const lineItemErrors = lineErrors[index];

    if (!lineItemErrors) {
      continue;
    }

    if (lineItemErrors.productId) {
      focusProductionLineField(index, 'productId');
      return;
    }

    if (lineItemErrors.quantity) {
      focusProductionLineField(index, 'quantity');
      return;
    }
  }
}

export function getLocalProductionDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
