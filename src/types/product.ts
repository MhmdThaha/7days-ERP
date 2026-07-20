export type ProductId = string;

export type Product = {
  id: ProductId;
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
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  deletedAt: Date | null;
  deletedBy: string | null;
};

export type ProductListItem = Pick<
  Product,
  | 'id'
  | 'code'
  | 'name'
  | 'category'
  | 'unit'
  | 'sellingPrice'
  | 'description'
  | 'isActive'
  | 'currentStock'
  | 'activeRecipeId'
  | 'createdAt'
  | 'updatedAt'
>;

export type ProductStatusFilter = 'all' | 'active' | 'inactive';

export type ProductListParams = {
  search?: string;
  status?: ProductStatusFilter;
  page?: number;
  pageSize?: number;
};

export type ProductListResult = {
  items: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type CreateProductInput = {
  code?: string;
  name: string;
  category: string;
  sellingPrice: number;
  description?: string | null;
  isActive?: boolean;
};

export type UpdateProductInput = {
  code?: string;
  name?: string;
  category?: string;
  sellingPrice?: number;
  description?: string | null;
  isActive?: boolean;
};
