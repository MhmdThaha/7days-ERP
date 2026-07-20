import type { ProductListItem } from '@/types/product';

export function formatWastageStock(quantity: number, unit: string): string {
  return `${quantity.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${unit}`;
}

export function getWastageStockExceededMessage(
  quantity: number,
  availableStock: number,
  unit: string,
): string | null {
  if (Number.isNaN(quantity) || quantity <= 0) {
    return null;
  }

  if (quantity > availableStock) {
    return `Only ${formatWastageStock(availableStock, unit)} available`;
  }

  return null;
}

type WastageLineStockInput = {
  productId: string;
  quantity: number;
};

export function getWastageLineStockErrors(
  lines: WastageLineStockInput[],
  productsById: Map<string, ProductListItem>,
): (string | null)[] {
  return lines.map((line) => {
    if (!line.productId) {
      return null;
    }

    const product = productsById.get(line.productId);

    if (!product) {
      return null;
    }

    return getWastageStockExceededMessage(line.quantity, product.currentStock, product.unit);
  });
}

export function hasWastageLinesStockErrors(
  lines: WastageLineStockInput[],
  productsById: Map<string, ProductListItem>,
): boolean {
  return getWastageLineStockErrors(lines, productsById).some((message) => message !== null);
}
