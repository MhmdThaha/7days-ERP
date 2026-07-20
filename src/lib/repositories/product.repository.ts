import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';

import { DEFAULT_PRODUCT_UNIT } from '@/lib/domain/constants/product';
import { timestampToDate, normalizeNullableString } from '@/lib/firebase/converters';
import { buildAuditFields, getOrgCollection } from '@/lib/repositories/base.repository';
import type {
  CreateProductInput,
  Product,
  ProductListItem,
  ProductListParams,
  ProductListResult,
  ProductStatusFilter,
  UpdateProductInput,
} from '@/types/product';

type ProductDocument = {
  organizationId: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  sellingPrice: number;
  description: string | null;
  isActive: boolean;
  currentStock: number;
  averageCost: number;
  activeRecipeId: string | null;
  imageUrl: string | null;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
  deletedAt: Timestamp | null;
  deletedBy: string | null;
};

function toProduct(id: string, data: ProductDocument): Product {
  return {
    id,
    organizationId: data.organizationId,
    code: data.code,
    name: data.name,
    category: data.category,
    unit: data.unit,
    sellingPrice: data.sellingPrice,
    description: data.description,
    isActive: data.isActive,
    currentStock: data.currentStock,
    averageCost: data.averageCost ?? 0,
    activeRecipeId: data.activeRecipeId,
    imageUrl: data.imageUrl,
    createdAt: timestampToDate(data.createdAt) ?? new Date(),
    createdBy: data.createdBy,
    updatedAt: timestampToDate(data.updatedAt) ?? new Date(),
    updatedBy: data.updatedBy,
    deletedAt: timestampToDate(data.deletedAt),
    deletedBy: data.deletedBy,
  };
}

function toListItem(product: Product): ProductListItem {
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

function matchesStatus(isActive: boolean, status: ProductStatusFilter): boolean {
  if (status === 'all') {
    return true;
  }

  return status === 'active' ? isActive : !isActive;
}

function matchesSearch(product: ProductListItem, search: string): boolean {
  const term = search.trim().toLowerCase();

  if (!term) {
    return true;
  }

  return (
    product.name.toLowerCase().includes(term) || product.code.toLowerCase().includes(term)
  );
}

export const productRepository = {
  async list(orgId: string, params: ProductListParams): Promise<ProductListResult> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const status = params.status ?? 'active';
    const search = params.search ?? '';

    const snapshot = await getOrgCollection(orgId, 'products')
      .where('deletedAt', '==', null)
      .get();

    const allItems = snapshot.docs
      .map((doc) => toProduct(doc.id, doc.data() as ProductDocument))
      .filter((product) => matchesStatus(product.isActive, status))
      .map(toListItem)
      .filter((product) => matchesSearch(product, search))
      .sort((a, b) => a.name.localeCompare(b.name));

    const total = allItems.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;

    return {
      items: allItems.slice(start, start + pageSize),
      total,
      page: safePage,
      pageSize,
      totalPages,
    };
  },

  async sumStockValue(orgId: string): Promise<number> {
    const snapshot = await getOrgCollection(orgId, 'products')
      .where('deletedAt', '==', null)
      .get();

    return snapshot.docs.reduce((total, doc) => {
      const data = doc.data() as ProductDocument;
      return total + (data.currentStock ?? 0) * (data.averageCost ?? 0);
    }, 0);
  },

  async getById(orgId: string, productId: string): Promise<Product | null> {
    const doc = await getOrgCollection(orgId, 'products').doc(productId).get();

    if (!doc.exists) {
      return null;
    }

    const product = toProduct(doc.id, doc.data() as ProductDocument);

    if (product.deletedAt) {
      return null;
    }

    return product;
  },

  async findByCode(orgId: string, code: string, excludeId?: string): Promise<Product | null> {
    const normalizedCode = code.trim().toUpperCase();
    const snapshot = await getOrgCollection(orgId, 'products')
      .where('code', '==', normalizedCode)
      .where('deletedAt', '==', null)
      .limit(1)
      .get();

    const doc = snapshot.docs[0];

    if (!doc) {
      return null;
    }

    if (excludeId && doc.id === excludeId) {
      return null;
    }

    return toProduct(doc.id, doc.data() as ProductDocument);
  },

  async findByName(orgId: string, name: string, excludeId?: string): Promise<Product | null> {
    const normalizedName = name.trim().toLowerCase();
    const snapshot = await getOrgCollection(orgId, 'products')
      .where('deletedAt', '==', null)
      .get();

    const match = snapshot.docs.find((doc) => {
      if (excludeId && doc.id === excludeId) {
        return false;
      }

      const data = doc.data() as ProductDocument;
      return data.name.trim().toLowerCase() === normalizedName;
    });

    if (!match) {
      return null;
    }

    return toProduct(match.id, match.data() as ProductDocument);
  },

  async getHighestCodeNumber(orgId: string): Promise<number> {
    const snapshot = await getOrgCollection(orgId, 'products')
      .where('deletedAt', '==', null)
      .get();

    let highest = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data() as ProductDocument;
      const match = /^PRD-(\d+)$/i.exec(data.code);

      if (match?.[1]) {
        const value = Number.parseInt(match[1], 10);

        if (!Number.isNaN(value) && value > highest) {
          highest = value;
        }
      }
    }

    return highest;
  },

  async create(orgId: string, input: CreateProductInput, userId: string): Promise<Product> {
    const collection = getOrgCollection(orgId, 'products');
    const docRef = collection.doc();
    const now = Timestamp.now();

    const document: ProductDocument = {
      organizationId: orgId,
      code: input.code?.trim().toUpperCase() ?? '',
      name: input.name.trim(),
      category: input.category,
      unit: DEFAULT_PRODUCT_UNIT,
      sellingPrice: input.sellingPrice,
      description: normalizeNullableString(input.description),
      isActive: input.isActive ?? true,
      currentStock: 0,
      averageCost: 0,
      activeRecipeId: null,
      imageUrl: null,
      createdAt: now,
      createdBy: userId,
      updatedAt: now,
      updatedBy: userId,
      deletedAt: null,
      deletedBy: null,
    };

    await docRef.set(document);
    return toProduct(docRef.id, document);
  },

  async update(
    orgId: string,
    productId: string,
    input: UpdateProductInput,
    userId: string,
  ): Promise<Product> {
    const docRef = getOrgCollection(orgId, 'products').doc(productId);
    const existing = await docRef.get();

    if (!existing.exists) {
      throw new Error('Product not found');
    }

    const audit = buildAuditFields(userId, false);

    const updates: Partial<ProductDocument> = {
      ...audit,
    };

    if (input.code !== undefined) {
      updates.code = input.code.trim().toUpperCase();
    }

    if (input.name !== undefined) {
      updates.name = input.name.trim();
    }

    if (input.category !== undefined) {
      updates.category = input.category;
    }

    if (input.sellingPrice !== undefined) {
      updates.sellingPrice = input.sellingPrice;
    }

    if (input.description !== undefined) {
      updates.description = normalizeNullableString(input.description);
    }

    if (input.isActive !== undefined) {
      updates.isActive = input.isActive;
    }

    await docRef.update(updates);

    const updated = await docRef.get();
    return toProduct(updated.id, updated.data() as ProductDocument);
  },

  async softDelete(orgId: string, productId: string, userId: string): Promise<void> {
    const docRef = getOrgCollection(orgId, 'products').doc(productId);
    const now = Timestamp.now();

    await docRef.update({
      deletedAt: now,
      deletedBy: userId,
      updatedAt: now,
      updatedBy: userId,
      isActive: false,
    });
  },

  async updateActiveRecipeId(
    orgId: string,
    productId: string,
    recipeId: string | null,
    userId: string,
  ): Promise<void> {
    const docRef = getOrgCollection(orgId, 'products').doc(productId);
    const audit = buildAuditFields(userId, false);

    await docRef.update({
      activeRecipeId: recipeId,
      ...audit,
    });
  },
};
