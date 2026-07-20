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
