import type { Product, ProductListItem } from '@/types/product';
import type { RawMaterial, RawMaterialListItem } from '@/types/raw-material';

export function toProductListItem(product: Product): ProductListItem {
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    category: product.category,
    unit: product.unit,
    sellingPrice: product.sellingPrice,
    description: product.description,
    isActive: product.isActive,
    currentStock: product.currentStock,
    activeRecipeId: product.activeRecipeId,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

export function toRawMaterialListItem(material: RawMaterial): RawMaterialListItem {
  return {
    id: material.id,
    code: material.code,
    name: material.name,
    category: material.category,
    unit: material.unit,
    reorderLevel: material.reorderLevel,
    description: material.description,
    isActive: material.isActive,
    currentStock: material.currentStock,
    averageCost: material.averageCost,
    createdAt: material.createdAt,
    updatedAt: material.updatedAt,
  };
}
