export type RecipeId = string;

export type RecipeIngredient = {
  rawMaterialId: string;
  rawMaterialName: string;
  quantity: number;
  unit: string;
};

export type Recipe = {
  id: RecipeId;
  organizationId: string;
  productId: string;
  recipeCode: string;
  recipeName: string;
  version: number;
  ingredients: RecipeIngredient[];
  totalWeight: number;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  deletedAt: Date | null;
  deletedBy: string | null;
};

export type RecipeListItem = {
  id: RecipeId;
  productId: string;
  productName: string;
  recipeCode: string;
  recipeName: string;
  version: number;
  ingredientCount: number;
  totalWeight: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type RecipeStatusFilter = 'all' | 'active' | 'inactive';

export type RecipeListParams = {
  search?: string;
  status?: RecipeStatusFilter;
  page?: number;
  pageSize?: number;
};

export type RecipeListResult = {
  items: RecipeListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type RecipeIngredientInput = {
  rawMaterialId: string;
  quantity: number;
  unit: string;
};

export type CreateRecipeInput = {
  productId: string;
  recipeCode?: string;
  recipeName: string;
  ingredients: RecipeIngredientInput[];
  notes?: string | null;
  isActive?: boolean;
};

export type UpdateRecipeInput = {
  recipeName?: string;
  ingredients?: RecipeIngredientInput[];
  notes?: string | null;
  isActive?: boolean;
};
