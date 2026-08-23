import type { FieldErrors } from 'react-hook-form';

import type { PurchaseFormValues } from '@/lib/domain/schemas/purchase.schema';

export type PurchaseFieldError = {
  field:
    | keyof PurchaseFormValues
    | `lineItems.${number}.rawMaterialId`
    | `lineItems.${number}.packCount`
    | `lineItems.${number}.packSize`
    | `lineItems.${number}.packPrice`;
  message: string;
};

export function mapPurchaseActionError(code?: string): PurchaseFieldError | null {
  void code;
  return null;
}

export function focusPurchaseLineItemField(
  index: number,
  field: 'rawMaterialId' | 'packCount' | 'packSize' | 'packPrice',
): void {
  window.requestAnimationFrame(() => {
    const element = document.getElementById(`line-item-${index}-${field}`);

    if (element instanceof HTMLElement) {
      element.focus({ preventScroll: false });
    }
  });
}

export function focusPurchaseFormField(field: PurchaseFieldError['field']): void {
  const lineItemMatch = /^lineItems\.(\d+)\.(rawMaterialId|packCount|packSize|packPrice)$/.exec(
    field,
  );

  if (lineItemMatch?.[1] && lineItemMatch[2]) {
    focusPurchaseLineItemField(
      Number.parseInt(lineItemMatch[1], 10),
      lineItemMatch[2] as 'rawMaterialId' | 'packCount' | 'packSize' | 'packPrice',
    );
    return;
  }

  const element = document.getElementById(field);

  if (element instanceof HTMLElement) {
    element.focus();
  }
}

export function focusFirstPurchaseFormError(errors: FieldErrors<PurchaseFormValues>): void {
  const headerFields = [
    'purchaseDate',
    'supplierName',
    'invoiceNumber',
    'paymentStatus',
    'notes',
  ] as const;

  for (const field of headerFields) {
    if (errors[field]) {
      focusPurchaseFormField(field);
      return;
    }
  }

  if (errors.lineItems?.message) {
    const firstLineItem = document.querySelector<HTMLElement>('[id^="line-item-0-"]');

    if (firstLineItem) {
      firstLineItem.focus();
    }

    return;
  }

  const lineItemsErrors = errors.lineItems;

  if (Array.isArray(lineItemsErrors)) {
    for (let index = 0; index < lineItemsErrors.length; index += 1) {
      const lineItemErrors = lineItemsErrors[index];

      if (!lineItemErrors) {
        continue;
      }

      if (lineItemErrors.rawMaterialId) {
        focusPurchaseLineItemField(index, 'rawMaterialId');
        return;
      }

      if (lineItemErrors.packCount) {
        focusPurchaseLineItemField(index, 'packCount');
        return;
      }

      if (lineItemErrors.packSize) {
        focusPurchaseLineItemField(index, 'packSize');
        return;
      }

      if (lineItemErrors.packPrice) {
        focusPurchaseLineItemField(index, 'packPrice');
        return;
      }
    }
  }

  if (errors.discountAmount) {
    focusPurchaseFormField('discountAmount');
    return;
  }

  if (errors.adjustmentAmount) {
    focusPurchaseFormField('adjustmentAmount');
  }
}

export function getLocalDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
