export type ReturnId = string;

export type ReturnReason = 'damaged' | 'expired' | 'unsold' | 'other';

export type ReturnStatus = 'draft' | 'completed';

export type ReturnLineItem = {
  id: string;
  productId: string;
  productNameSnapshot: string;
  productCodeSnapshot: string;
  quantity: number;
  unit: string;
};

export type ReturnEntry = {
  id: ReturnId;
  organizationId: string;
  returnNumber: string;
  returnDate: string;
  reason: ReturnReason;
  status: ReturnStatus;
  lines: ReturnLineItem[];
  lineCount: number;
  totalUnits: number;
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

export type ReturnListItem = {
  id: ReturnId;
  returnNumber: string;
  returnDate: string;
  reason: ReturnReason;
  lineCount: number;
  totalUnits: number;
  status: ReturnStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type ReturnListParams = {
  search?: string;
  page?: number;
  pageSize?: number;
};

export type ReturnListResult = {
  items: ReturnListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type ReturnLineItemInput = {
  id?: string;
  productId: string;
  quantity: number;
};

export type CreateReturnInput = {
  returnDate: string;
  reason: ReturnReason;
  lines: ReturnLineItemInput[];
  notes?: string | null;
};

export type UpdateReturnInput = {
  returnDate?: string;
  reason?: ReturnReason;
  lines?: ReturnLineItemInput[];
  notes?: string | null;
};
