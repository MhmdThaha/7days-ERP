'use server';

import {
  createProductSchema,
  productListParamsSchema,
  updateProductSchema,
} from '@/lib/domain/schemas/product.schema';
import { DomainError } from '@/lib/domain/errors';
import { getServerOrgContext } from '@/lib/firebase/auth-server';
import { productService } from '@/lib/services/product.service';
import { wrapAction, type ActionResult } from '@/lib/utils/action-result';
import type {
  CreateProductInput,
  Product,
  ProductListParams,
  ProductListResult,
  UpdateProductInput,
} from '@/types/product';

export async function listProductsAction(
  params: ProductListParams,
): Promise<ActionResult<ProductListResult>> {
  return wrapAction(async () => {
    const { orgId } = await getServerOrgContext();
    const validated = productListParamsSchema.parse(params);
    return productService.list(orgId, validated);
  });
}

export async function getProductAction(productId: string): Promise<ActionResult<Product>> {
  return wrapAction(async () => {
    const { orgId } = await getServerOrgContext();
    return productService.getById(orgId, productId);
  });
}

export async function createProductAction(
  input: CreateProductInput,
): Promise<ActionResult<Product>> {
  return wrapAction(async () => {
    const { orgId, userId } = await getServerOrgContext();
    const validated = createProductSchema.parse({
      ...input,
      code: input.code ?? '',
      description: input.description ?? null,
      isActive: input.isActive ?? true,
    });

    return productService.create(
      orgId,
      {
        code: validated.code,
        name: validated.name,
        category: validated.category,
        sellingPrice: validated.sellingPrice,
        description: validated.description ?? null,
        isActive: validated.isActive,
      },
      userId,
    );
  });
}

export async function updateProductAction(
  productId: string,
  input: UpdateProductInput,
): Promise<ActionResult<Product>> {
  return wrapAction(async () => {
    const { orgId, userId } = await getServerOrgContext();
    const validated = updateProductSchema.parse({
      ...input,
      code: input.code ?? '',
    });

    if (Object.keys(validated).length === 0) {
      throw new DomainError('VALIDATION_ERROR', 'No changes provided');
    }

    return productService.update(orgId, productId, validated, userId);
  });
}

export async function deleteProductAction(productId: string): Promise<ActionResult<void>> {
  return wrapAction(async () => {
    const { orgId, userId } = await getServerOrgContext();
    await productService.softDelete(orgId, productId, userId);
  });
}
