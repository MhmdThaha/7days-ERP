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

/** Cursor for Firestore saleDate DESC + saleNumber DESC pagination. */
export type SalePageCursor = {
  saleDate: string;
  saleNumber: string;
};

export type SaleListPagePosition = 'first' | 'next' | 'prev' | 'last';

/**
 * Sales-page pagination params. When `search` is non-empty, callers should use
 * the legacy list path (substring search); listPage ignores search.
 */
export type SaleListPageParams = {
  status?: SaleStatusFilter;
  pageSize?: number;
  /** UI page number echoed in the result (1-based). */
  page?: number;
  position: SaleListPagePosition;
  /** Required for `next` / `prev`. */
  cursor?: SalePageCursor | null;
  /**
   * When set (non-empty), Sales UI uses legacy substring search via list().
   * Not applied inside saleRepository.listPage.
   */
  search?: string;
};

export type SaleListPageResult = SaleListResult & {
  startCursor: SalePageCursor | null;
  endCursor: SalePageCursor | null;
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
  /** When provided (e.g. sales import), used instead of auto-generating a number. */
  saleNumber?: string;
};

export type UpdateSaleInput = {
  saleDate?: string;
  customerName?: string | null;
  lines?: SaleLineItemInput[];
  notes?: string | null;
};
