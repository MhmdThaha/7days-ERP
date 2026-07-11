import type { RawMaterialFormValues } from '@/lib/domain/schemas/raw-material.schema';

export type RawMaterialFieldError = {
  field: keyof RawMaterialFormValues;
  message: string;
};

export function mapRawMaterialActionError(code?: string): RawMaterialFieldError | null {
  switch (code) {
    case 'DUPLICATE_NAME':
      return { field: 'name', message: 'Raw material name already exists.' };
    case 'DUPLICATE_CODE':
      return { field: 'code', message: 'Code already in use.' };
    default:
      return null;
  }
}

export function focusRawMaterialFormField(field: keyof RawMaterialFormValues): void {
  const fieldId = field === 'category' || field === 'unit' ? field : field;
  const element = document.getElementById(fieldId);

  if (element instanceof HTMLElement) {
    element.focus();
  }
}
