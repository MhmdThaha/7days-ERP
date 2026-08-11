import type { ColumnDefinition, MappingConfig } from '@/lib/import/engine/types';

const SALE_PRODUCT_FIELDS = ['productName', 'productCode'] as const;
const SALE_QUANTITY_FIELD = 'quantity';

export function mappingIncludesTargetField(
  mapping: MappingConfig,
  targetField: string,
): boolean {
  return mapping.columnMappings.some((entry) => entry.targetField === targetField);
}

export function mappingIncludesSaleDate(mapping: MappingConfig): boolean {
  return mappingIncludesTargetField(mapping, 'saleDate');
}

export type SalesMappingRequirement = {
  field: string;
  label: string;
};

export function getSalesMappingRequirements(
  columns: readonly ColumnDefinition[],
): readonly SalesMappingRequirement[] {
  const labelByField = new Map(columns.map((column) => [column.field, column.label]));

  return [
    {
      field: 'product',
      label: 'Product Name or Product Code',
    },
    {
      field: SALE_QUANTITY_FIELD,
      label: labelByField.get(SALE_QUANTITY_FIELD) ?? 'Quantity',
    },
  ];
}

export function getSalesMappingMissingRequirements(
  mapping: MappingConfig,
  columns: readonly ColumnDefinition[],
): readonly SalesMappingRequirement[] {
  const missing: SalesMappingRequirement[] = [];

  const hasProduct = SALE_PRODUCT_FIELDS.some((field) => mappingIncludesTargetField(mapping, field));

  if (!hasProduct) {
    missing.push(getSalesMappingRequirements(columns)[0]!);
  }

  if (!mappingIncludesTargetField(mapping, SALE_QUANTITY_FIELD)) {
    missing.push(getSalesMappingRequirements(columns)[1]!);
  }

  return missing;
}

export function isSalesMappingReady(
  mapping: MappingConfig,
  columns: readonly ColumnDefinition[],
): boolean {
  return getSalesMappingMissingRequirements(mapping, columns).length === 0;
}
