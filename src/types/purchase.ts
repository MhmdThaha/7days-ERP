export type PurchaseId = string;

export type PurchaseStatus = 'draft' | 'received';

export type PaymentStatus = 'paid' | 'credit';

export type PurchaseLineItem = {
  id: string;
  rawMaterialId: string;
  rawMaterialCode: string;
  rawMaterialName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  lineTotal: number;
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
  totalAmount: number;
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

export type PurchaseLineItemInput = {
  id?: string;
  rawMaterialId: string;
  quantity: number;
  unit: string;
  unitCost: number;
};

export type CreatePurchaseInput = {
  purchaseDate: string;
  supplierName: string;
  invoiceNumber?: string | null;
  paymentStatus: PaymentStatus;
  lineItems: PurchaseLineItemInput[];
  notes?: string | null;
};

export type UpdatePurchaseInput = {
  purchaseDate?: string;
  supplierName?: string;
  invoiceNumber?: string | null;
  paymentStatus?: PaymentStatus;
  lineItems?: PurchaseLineItemInput[];
  notes?: string | null;
};
