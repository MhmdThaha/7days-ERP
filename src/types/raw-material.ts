export type RawMaterialId = string;

export type RawMaterial = {
  id: RawMaterialId;
  organizationId: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  reorderLevel: number | null;
  description: string | null;
  isActive: boolean;
  currentStock: number;
  averageCost: number;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  deletedAt: Date | null;
  deletedBy: string | null;
};

export type RawMaterialListItem = Pick<
  RawMaterial,
  | 'id'
  | 'code'
  | 'name'
  | 'category'
  | 'unit'
  | 'reorderLevel'
  | 'description'
  | 'isActive'
  | 'currentStock'
  | 'averageCost'
  | 'createdAt'
  | 'updatedAt'
>;

export type RawMaterialStatusFilter = 'all' | 'active' | 'inactive';

export type RawMaterialListParams = {
  search?: string;
  status?: RawMaterialStatusFilter;
  category?: string;
  lowStockOnly?: boolean;
  page?: number;
  pageSize?: number;
};

export type RawMaterialListResult = {
  items: RawMaterialListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type CreateRawMaterialInput = {
  code?: string;
  name: string;
  category: string;
  unit: string;
  reorderLevel?: number | null;
  description?: string | null;
  isActive?: boolean;
};

export type UpdateRawMaterialInput = {
  code?: string;
  name?: string;
  category?: string;
  unit?: string;
  reorderLevel?: number | null;
  description?: string | null;
  isActive?: boolean;
};
