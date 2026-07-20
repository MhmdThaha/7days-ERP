export type SaleId = string;

export type SaleStatus = 'draft' | 'completed';

export type SaleStatusFilter = 'all' | 'draft' | 'completed';

export type SaleLineItem = {
  id: string;
  productId: string;
  productNameSnapshot: string;
  productCodeSnapshot: string;
  sellingPriceSnapshot: number;
  quantity: number;
  unit: string;
  lineTotal: number;
  unitCost: number;
  cogs: number;
};

export type Sale = {
  id: SaleId;
  organizationId: string;
  saleNumber: string;
  saleDate: string;
  customerId: string | null;
  customerNameSnapshot: string | null;
  status: SaleStatus;
  lines: SaleLineItem[];
  subtotal: number;
  totalCogs: number;
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

export type SaleListItem = {
  id: SaleId;
  saleNumber: string;
  saleDate: string;
  customerNameSnapshot: string | null;
  lineCount: number;
  subtotal: number;
  totalCogs: number;
  status: SaleStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type SaleListParams = {
  search?: string;
  status?: SaleStatusFilter;
  page?: number;
  pageSize?: number;
};

export type SaleListResult = {
  items: SaleListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type SaleLineItemInput = {
  id?: string;
  productId: string;
  quantity: number;
  sellingPrice: number;
};

export type CreateSaleInput = {
  saleDate: string;
  customerName?: string | null;
  lines: SaleLineItemInput[];
  notes?: string | null;
};

export type UpdateSaleInput = {
  saleDate?: string;
  customerName?: string | null;
  lines?: SaleLineItemInput[];
  notes?: string | null;
};
