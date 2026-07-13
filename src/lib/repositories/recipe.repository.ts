import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';

import { normalizeNullableString, timestampToDate } from '@/lib/firebase/converters';
import { buildAuditFields, getOrgCollection } from '@/lib/repositories/base.repository';
import type {
  Recipe,
  RecipeIngredient,
  RecipeListItem,
  RecipeListParams,
  RecipeListResult,
  RecipeStatusFilter,
} from '@/types/recipe';

type RecipeIngredientDocument = {
  rawMaterialId: string;
  rawMaterialName: string;
  quantity: number;
  unit: string;
};

type RecipeDocument = {
  organizationId: string;
  productId: string;
  recipeCode: string;
  recipeName: string;
  version: number;
  ingredients: RecipeIngredientDocument[];
  totalWeight: number;
  notes: string | null;
  isActive: boolean;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
  deletedAt: Timestamp | null;
  deletedBy: string | null;
};

function toRecipeIngredient(data: RecipeIngredientDocument): RecipeIngredient {
  return {
    rawMaterialId: data.rawMaterialId,
    rawMaterialName: data.rawMaterialName,
    quantity: data.quantity,
    unit: data.unit,
  };
}

function toRecipe(id: string, data: RecipeDocument): Recipe {
  return {
    id,
    organizationId: data.organizationId,
    productId: data.productId,
    recipeCode: data.recipeCode,
    recipeName: data.recipeName,
    version: data.version,
    ingredients: data.ingredients.map(toRecipeIngredient),
    totalWeight: data.totalWeight,
    notes: data.notes,
    isActive: data.isActive,
    createdAt: timestampToDate(data.createdAt) ?? new Date(),
    createdBy: data.createdBy,
    updatedAt: timestampToDate(data.updatedAt) ?? new Date(),
    updatedBy: data.updatedBy,
    deletedAt: timestampToDate(data.deletedAt),
    deletedBy: data.deletedBy,
  };
}

function toListItem(recipe: Recipe, productName: string): RecipeListItem {
  return {
    id: recipe.id,
    productId: recipe.productId,
    productName,
    recipeCode: recipe.recipeCode,
    recipeName: recipe.recipeName,
    version: recipe.version,
    ingredientCount: recipe.ingredients.length,
    totalWeight: recipe.totalWeight,
    isActive: recipe.isActive,
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt,
  };
}

function matchesStatus(isActive: boolean, status: RecipeStatusFilter): boolean {
  if (status === 'all') {
    return true;
  }

  return status === 'active' ? isActive : !isActive;
}

function matchesSearch(recipe: RecipeListItem, search: string): boolean {
  const term = search.trim().toLowerCase();

  if (!term) {
    return true;
  }

  return (
    recipe.recipeName.toLowerCase().includes(term) ||
    recipe.recipeCode.toLowerCase().includes(term) ||
    recipe.productName.toLowerCase().includes(term)
  );
}

export const recipeRepository = {
  async list(
    orgId: string,
    params: RecipeListParams,
    productNames: Map<string, string>,
  ): Promise<RecipeListResult> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const status = params.status ?? 'active';
    const search = params.search ?? '';

    const snapshot = await getOrgCollection(orgId, 'recipes')
      .where('deletedAt', '==', null)
      .get();

    const allItems = snapshot.docs
      .map((doc) => toRecipe(doc.id, doc.data() as RecipeDocument))
      .filter((recipe) => matchesStatus(recipe.isActive, status))
      .map((recipe) =>
        toListItem(recipe, productNames.get(recipe.productId) ?? 'Unknown product'),
      )
      .filter((recipe) => matchesSearch(recipe, search))
      .sort((a, b) => a.recipeName.localeCompare(b.recipeName));

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

  async getById(orgId: string, recipeId: string): Promise<Recipe | null> {
    const doc = await getOrgCollection(orgId, 'recipes').doc(recipeId).get();

    if (!doc.exists) {
      return null;
    }

    const recipe = toRecipe(doc.id, doc.data() as RecipeDocument);

    if (recipe.deletedAt) {
      return null;
    }

    return recipe;
  },

  async findActiveByProductId(
    orgId: string,
    productId: string,
    excludeId?: string,
  ): Promise<Recipe | null> {
    const snapshot = await getOrgCollection(orgId, 'recipes')
      .where('productId', '==', productId)
      .where('deletedAt', '==', null)
      .get();

    const match = snapshot.docs.find((doc) => {
      if (excludeId && doc.id === excludeId) {
        return false;
      }

      const data = doc.data() as RecipeDocument;
      return data.isActive;
    });

    if (!match) {
      return null;
    }

    return toRecipe(match.id, match.data() as RecipeDocument);
  },

  async findByCode(orgId: string, code: string, excludeId?: string): Promise<Recipe | null> {
    const normalizedCode = code.trim().toUpperCase();
    const snapshot = await getOrgCollection(orgId, 'recipes')
      .where('recipeCode', '==', normalizedCode)
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

    return toRecipe(doc.id, doc.data() as RecipeDocument);
  },

  async getHighestCodeNumber(orgId: string): Promise<number> {
    const snapshot = await getOrgCollection(orgId, 'recipes')
      .where('deletedAt', '==', null)
      .get();

    let highest = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data() as RecipeDocument;
      const match = /^RCP-(\d+)$/i.exec(data.recipeCode);

      if (match?.[1]) {
        const value = Number.parseInt(match[1], 10);

        if (!Number.isNaN(value) && value > highest) {
          highest = value;
        }
      }
    }

    return highest;
  },

  async create(
    orgId: string,
    input: {
      productId: string;
      recipeCode: string;
      recipeName: string;
      ingredients: RecipeIngredient[];
      totalWeight: number;
      notes?: string | null;
      isActive?: boolean;
    },
    userId: string,
  ): Promise<Recipe> {
    const collection = getOrgCollection(orgId, 'recipes');
    const docRef = collection.doc();
    const now = Timestamp.now();

    const document: RecipeDocument = {
      organizationId: orgId,
      productId: input.productId,
      recipeCode: input.recipeCode.trim().toUpperCase(),
      recipeName: input.recipeName.trim(),
      version: 1,
      ingredients: input.ingredients.map((ingredient) => ({
        rawMaterialId: ingredient.rawMaterialId,
        rawMaterialName: ingredient.rawMaterialName,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
      })),
      totalWeight: input.totalWeight,
      notes: normalizeNullableString(input.notes),
      isActive: input.isActive ?? true,
      createdAt: now,
      createdBy: userId,
      updatedAt: now,
      updatedBy: userId,
      deletedAt: null,
      deletedBy: null,
    };

    await docRef.set(document);
    return toRecipe(docRef.id, document);
  },

  async update(
    orgId: string,
    recipeId: string,
    input: {
      recipeName?: string;
      ingredients?: RecipeIngredient[];
      totalWeight?: number;
      notes?: string | null;
      isActive?: boolean;
    },
    userId: string,
  ): Promise<Recipe> {
    const docRef = getOrgCollection(orgId, 'recipes').doc(recipeId);
    const existing = await docRef.get();

    if (!existing.exists) {
      throw new Error('Recipe not found');
    }

    const audit = buildAuditFields(userId, false);

    const updates: Partial<RecipeDocument> = {
      ...audit,
    };

    if (input.recipeName !== undefined) {
      updates.recipeName = input.recipeName.trim();
    }

    if (input.ingredients !== undefined) {
      updates.ingredients = input.ingredients.map((ingredient) => ({
        rawMaterialId: ingredient.rawMaterialId,
        rawMaterialName: ingredient.rawMaterialName,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
      }));
    }

    if (input.totalWeight !== undefined) {
      updates.totalWeight = input.totalWeight;
    }

    if (input.notes !== undefined) {
      updates.notes = normalizeNullableString(input.notes);
    }

    if (input.isActive !== undefined) {
      updates.isActive = input.isActive;
    }

    await docRef.update(updates);

    const updated = await docRef.get();
    return toRecipe(updated.id, updated.data() as RecipeDocument);
  },

  async softDelete(orgId: string, recipeId: string, userId: string): Promise<void> {
    const docRef = getOrgCollection(orgId, 'recipes').doc(recipeId);
    const now = Timestamp.now();

    await docRef.update({
      deletedAt: now,
      deletedBy: userId,
      updatedAt: now,
      updatedBy: userId,
      isActive: false,
    });
  },
};
