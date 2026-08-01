'use server';

import {
  createProductSchema,
  productListParamsSchema,
  updateProductSchema,
} from '@/lib/domain/schemas/product.schema';
import { DomainError } from '@/lib/domain/errors';
import { assertCan } from '@/lib/domain/permissions';
import { getAuthenticatedContext } from '@/lib/firebase/auth-server';
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
    // [PERF-GLOBAL-TEMP] instrumentation — remove after investigation
    const perfStart = performance.now();
    let perfLast = perfStart;

    const { orgId, role } = await getAuthenticatedContext();
    console.log(
      `[PERF-GLOBAL][action] listProductsAction auth: ${(performance.now() - perfLast).toFixed(0)} ms`,
    );
    perfLast = performance.now();

    assertCan(role, 'read', 'product');
    const validated = productListParamsSchema.parse(params);
    console.log(
      `[PERF-GLOBAL][action] listProductsAction validation: ${(performance.now() - perfLast).toFixed(0)} ms`,
    );
    perfLast = performance.now();

    const result = await productService.list(orgId, validated);
    console.log(
      `[PERF-GLOBAL][action] listProductsAction productService.list: ${(performance.now() - perfLast).toFixed(0)} ms`,
    );
    console.log(
      `[PERF-GLOBAL][action] listProductsAction TOTAL: ${(performance.now() - perfStart).toFixed(0)} ms`,
    );
    return result;
  });
}

export async function getProductAction(productId: string): Promise<ActionResult<Product>> {
  return wrapAction(async () => {
    const { orgId, role } = await getAuthenticatedContext();
    assertCan(role, 'read', 'product');
    return productService.getById(orgId, productId);
  });
}

export async function createProductAction(input: CreateProductInput): Promise<ActionResult<Product>> {
  return wrapAction(async () => {
    const { orgId, userId, role } = await getAuthenticatedContext();
    assertCan(role, 'create', 'product');
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
    const { orgId, userId, role } = await getAuthenticatedContext();
    assertCan(role, 'update', 'product');
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
    const { orgId, userId, role } = await getAuthenticatedContext();
    assertCan(role, 'delete', 'product');
    await productService.softDelete(orgId, productId, userId);
  });
}
