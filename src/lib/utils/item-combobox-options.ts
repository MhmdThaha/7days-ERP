import type { ProductListItem } from '@/types/product';
import type { RawMaterialListItem } from '@/types/raw-material';

import type { ItemComboboxOption } from '@/components/shared/item-combobox';

export function formatProductPickerLabel(product: ProductListItem): string {
  return `${product.code} - ${product.name}`;
}

export function formatRawMaterialPickerLabel(material: RawMaterialListItem): string {
  return `${material.code} - ${material.name}`;
}

export function buildProductComboboxOptions(
  products: ProductListItem[],
  selectedProductIds: string[],
): ItemComboboxOption[] {
  return products.map((product) => {
    const isAlreadyAdded = selectedProductIds.includes(product.id);
    const baseLabel = formatProductPickerLabel(product);

    return {
      value: product.id,
      label: isAlreadyAdded ? `${baseLabel} (already added)` : baseLabel,
      disabled: isAlreadyAdded,
      keywords: `${product.code} ${product.name} ${product.category}`,
    };
  });
}

export function buildRawMaterialComboboxOptions(
  materials: RawMaterialListItem[],
  selectedMaterialIds: string[],
): ItemComboboxOption[] {
  return materials.map((material) => {
    const isAlreadyAdded = selectedMaterialIds.includes(material.id);
    const baseLabel = formatRawMaterialPickerLabel(material);

    return {
      value: material.id,
      label: isAlreadyAdded ? `${baseLabel} (already added)` : baseLabel,
      disabled: isAlreadyAdded,
      keywords: `${material.code} ${material.name} ${material.category}`,
    };
  });
}
