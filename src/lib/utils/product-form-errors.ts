import type { ProductFormValues } from '@/lib/domain/schemas/product.schema';

export type ProductFieldError = {
  field: keyof ProductFormValues;
  message: string;
};

export function mapProductActionError(code?: string): ProductFieldError | null {
  switch (code) {
    case 'DUPLICATE_NAME':
      return { field: 'name', message: 'Product Name already exists.' };
    case 'DUPLICATE_CODE':
      return { field: 'code', message: 'Product Code already exists.' };
    default:
      return null;
  }
}

export function focusProductFormField(field: keyof ProductFormValues): void {
  const fieldId = field === 'category' ? 'category' : field;
  const element = document.getElementById(fieldId);

  if (element instanceof HTMLElement) {
    element.focus();
  }
}
