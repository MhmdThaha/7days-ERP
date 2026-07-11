import 'server-only';

import { PRODUCT_CODE_PREFIX } from '@/lib/domain/constants/product';
import { DomainError } from '@/lib/domain/errors';
import { productRepository } from '@/lib/repositories/product.repository';
import type {
  CreateProductInput,
  Product,
  ProductListParams,
  ProductListResult,
  UpdateProductInput,
} from '@/types/product';

function formatGeneratedCode(sequence: number): string {
  return `${PRODUCT_CODE_PREFIX}-${String(sequence).padStart(3, '0')}`;
}

async function resolveUniqueCode(
  orgId: string,
  code: string | undefined,
  excludeId?: string,
): Promise<string> {
  if (code && code.trim().length > 0) {
    const normalized = code.trim().toUpperCase();
    const existing = await productRepository.findByCode(orgId, normalized, excludeId);

    if (existing) {
      throw new DomainError('DUPLICATE_CODE', 'Product code already in use');
    }

    return normalized;
  }

  const highest = await productRepository.getHighestCodeNumber(orgId);
  let next = highest + 1;
  let generated = formatGeneratedCode(next);

  while (await productRepository.findByCode(orgId, generated, excludeId)) {
    next += 1;
    generated = formatGeneratedCode(next);
  }

  return generated;
}

async function assertUniqueName(
  orgId: string,
  name: string,
  excludeId?: string,
): Promise<void> {
  const existing = await productRepository.findByName(orgId, name, excludeId);

  if (existing) {
    throw new DomainError('DUPLICATE_NAME', 'A product with this name already exists');
  }
}

export const productService = {
  async list(orgId: string, params: ProductListParams): Promise<ProductListResult> {
    return productRepository.list(orgId, params);
  },

  async getById(orgId: string, productId: string): Promise<Product> {
    const product = await productRepository.getById(orgId, productId);

    if (!product) {
      throw new DomainError('NOT_FOUND', 'Product not found');
    }

    return product;
  },

  async create(orgId: string, input: CreateProductInput, userId: string): Promise<Product> {
    await assertUniqueName(orgId, input.name);

    const code = await resolveUniqueCode(orgId, input.code);

    return productRepository.create(
      orgId,
      {
        ...input,
        code,
      },
      userId,
    );
  },

  async update(
    orgId: string,
    productId: string,
    input: UpdateProductInput,
    userId: string,
  ): Promise<Product> {
    const existing = await productRepository.getById(orgId, productId);

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Product not found');
    }

    if (input.name && input.name.trim().toLowerCase() !== existing.name.trim().toLowerCase()) {
      await assertUniqueName(orgId, input.name, productId);
    }

    if (input.code !== undefined) {
      const resolvedCode = await resolveUniqueCode(orgId, input.code, productId);
      input = { ...input, code: resolvedCode };
    }

    return productRepository.update(orgId, productId, input, userId);
  },

  async softDelete(orgId: string, productId: string, userId: string): Promise<void> {
    const existing = await productRepository.getById(orgId, productId);

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Product not found');
    }

    await productRepository.softDelete(orgId, productId, userId);
  },
};
