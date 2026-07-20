import type { FieldErrors } from 'react-hook-form';

import type { SaleFormValues } from '@/lib/domain/schemas/sale.schema';

export type SaleFieldError = {
  field:
    | keyof SaleFormValues
    | `lines.${number}.productId`
    | `lines.${number}.quantity`
    | `lines.${number}.sellingPrice`;
  message: string;
};

export function mapSaleActionError(code?: string): SaleFieldError | null {
  void code;
  return null;
}

export function focusSaleLineField(
  index: number,
  field: 'productId' | 'quantity' | 'sellingPrice',
): void {
  window.requestAnimationFrame(() => {
    const element = document.getElementById(`sale-line-${index}-${field}`);

    if (element instanceof HTMLElement) {
      element.focus({ preventScroll: false });
    }
  });
}

export function focusSaleFormField(field: SaleFieldError['field']): void {
  const lineMatch = /^lines\.(\d+)\.(productId|quantity|sellingPrice)$/.exec(field);

  if (lineMatch?.[1] && lineMatch[2]) {
    focusSaleLineField(
      Number.parseInt(lineMatch[1], 10),
      lineMatch[2] as 'productId' | 'quantity' | 'sellingPrice',
    );
    return;
  }

  const element = document.getElementById(field);

  if (element instanceof HTMLElement) {
    element.focus();
  }
}

export function focusFirstSaleFormError(errors: FieldErrors<SaleFormValues>): void {
  const headerFields = ['saleDate', 'customerName', 'notes'] as const;

  for (const field of headerFields) {
    if (errors[field]) {
      focusSaleFormField(field);
      return;
    }
  }

  if (errors.lines?.message) {
    const firstLine = document.querySelector<HTMLElement>('[id^="sale-line-0-"]');

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
      focusSaleLineField(index, 'productId');
      return;
    }

    if (lineError.quantity) {
      focusSaleLineField(index, 'quantity');
      return;
    }

    if (lineError.sellingPrice) {
      focusSaleLineField(index, 'sellingPrice');
      return;
    }
  }
}

export function getLocalSaleDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
