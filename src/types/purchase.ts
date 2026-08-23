export type PurchaseId = string;

export type PurchaseStatus = 'draft' | 'received';

export type PurchaseStatusFilter = 'all' | 'draft' | 'received';

export type PaymentStatus = 'paid' | 'credit';

export type PurchaseLineItem = {
  id: string;
  rawMaterialId: string;
  rawMaterialCode: string;
  rawMaterialName: string;
  quantity: number;
  unit: string;
  /** Cost per stock unit in paise. May be fractional when derived from pack pricing. */
  unitCost: number;
  lineTotal: number;
  /** Pack entry metadata. Null on records created before pack-based entry. */
  packCount: number | null;
  packSize: number | null;
  /** Price per pack in integer paise. */
  packPrice: number | null;
};

export type Purchase = {
  id: PurchaseId;
  organizationId: string;
  purchaseNumber: string;
  purchaseDate: string;
  supplierName: string;
  invoiceNumber: string | null;
  status: PurchaseStatus;
  paymentStatus: PaymentStatus;
  lineItems: PurchaseLineItem[];
  /** Final payable in integer paise: subtotal − discount + adjustment. */
  totalAmount: number;
  /** Invoice-level discount in integer paise. Missing on older documents → 0. */
  discountAmount: number;
  /** Invoice-level round-off in integer paise. May be negative. Missing → 0. */
  adjustmentAmount: number;
  lineItemCount: number;
  notes: string | null;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  receivedAt: Date | null;
  receivedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
};

export type PurchaseListItem = {
  id: PurchaseId;
  purchaseNumber: string;
  purchaseDate: string;
  supplierName: string;
  invoiceNumber: string | null;
  paymentStatus: PaymentStatus;
  lineItemCount: number;
  totalAmount: number;
  status: PurchaseStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type PurchaseListParams = {
  search?: string;
  status?: PurchaseStatusFilter;
  page?: number;
  pageSize?: number;
};

export type PurchaseListResult = {
  items: PurchaseListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type PurchasePageCursor = {
  purchaseDate: string;
  purchaseNumber: string;
};

export type PurchaseListPagePosition = 'first' | 'next' | 'prev' | 'last';

/**
 * Purchases page params. Empty search → Firestore listPage.
 * Non-empty search → legacy list() substring path (listPage ignores search).
 */
export type PurchaseListPageParams = {
  search?: string;
  status?: PurchaseStatusFilter;
  page?: number;
  pageSize?: number;
  position: PurchaseListPagePosition;
  cursor?: PurchasePageCursor | null;
};

export type PurchaseListPageResult = PurchaseListResult & {
  startCursor: PurchasePageCursor | null;
  endCursor: PurchasePageCursor | null;
};

export type PurchaseLineItemInput = {
  id?: string;
  rawMaterialId: string;
  /** Number of packs purchased (1 for loose/unpacked quantities). */
  packCount: number;
  /** Quantity contained in one pack, in the material's stock unit. */
  packSize: number;
  unit: string;
  /** Price paid per pack in integer paise. */
  packPrice: number;
};

export type CreatePurchaseInput = {
  purchaseDate: string;
  supplierName: string;
  invoiceNumber?: string | null;
  paymentStatus: PaymentStatus;
  lineItems: PurchaseLineItemInput[];
  discountAmount?: number;
  adjustmentAmount?: number;
  notes?: string | null;
};

export type UpdatePurchaseInput = {
  purchaseDate?: string;
  supplierName?: string;
  invoiceNumber?: string | null;
  paymentStatus?: PaymentStatus;
  lineItems?: PurchaseLineItemInput[];
  discountAmount?: number;
  adjustmentAmount?: number;
  notes?: string | null;
};
