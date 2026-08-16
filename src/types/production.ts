import type { RecipeIngredient } from '@/types/recipe';

export type ProductionId = string;

export type ProductionStatus = 'draft' | 'completed';

export type ProductionStatusFilter = 'all' | 'draft' | 'completed';

export type ProductionLineItem = {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  unit: string;
  recipeId: string;
  recipeCode: string;
  recipeName: string;
  recipeVersion: number;
  /** Formula copied at draft save. Used when the user chooses Keep Current. */
  recipeBatchOutputQuantity?: number | null;
  recipeIngredients?: RecipeIngredient[];
};

export type Production = {
  id: ProductionId;
  organizationId: string;
  productionNumber: string;
  productionDate: string;
  status: ProductionStatus;
  lines: ProductionLineItem[];
  totalUnits: number;
  lineCount: number;
  notes: string | null;
  /** When true, complete/preview keep the draft recipe snapshot instead of the live recipe. */
  acceptedStaleRecipe?: boolean;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  completedAt: Date | null;
  completedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
};

export type ProductionListItem = {
  id: ProductionId;
  productionNumber: string;
  productionDate: string;
  lineCount: number;
  totalUnits: number;
  status: ProductionStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type ProductionListParams = {
  search?: string;
  status?: ProductionStatusFilter;
  page?: number;
  pageSize?: number;
};

export type ProductionListResult = {
  items: ProductionListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/** Cursor for Firestore productionDate DESC + productionNumber DESC pagination. */
export type ProductionPageCursor = {
  productionDate: string;
  productionNumber: string;
};

export type ProductionListPagePosition = 'first' | 'next' | 'prev' | 'last';

/**
 * Production-page pagination params. When `search` is non-empty, callers should use
 * the legacy list path (substring search); listPage ignores search.
 */
export type ProductionListPageParams = {
  status?: ProductionStatusFilter;
  pageSize?: number;
  page?: number;
  position: ProductionListPagePosition;
  cursor?: ProductionPageCursor | null;
  search?: string;
};

export type ProductionListPageResult = ProductionListResult & {
  startCursor: ProductionPageCursor | null;
  endCursor: ProductionPageCursor | null;
};

export type ProductionLineItemInput = {
  id?: string;
  productId: string;
  quantity: number;
  unit: string;
};

export type CreateProductionInput = {
  productionDate: string;
  lines: ProductionLineItemInput[];
  notes?: string | null;
};

export type UpdateProductionInput = {
  productionDate?: string;
  lines?: ProductionLineItemInput[];
  notes?: string | null;
  acceptedStaleRecipe?: boolean;
};

export type MaterialPreviewRow = {
  rawMaterialId: string;
  rawMaterialCode: string;
  rawMaterialName: string;
  unit: string;
  requiredQuantity: number;
  currentStock: number;
  shortage: number;
};
