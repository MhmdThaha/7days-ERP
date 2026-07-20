export type WastageId = string;

export type WastageReason = 'damaged' | 'burnt' | 'expired' | 'other';

export type WastageStatus = 'draft' | 'completed';

export type WastageLineItem = {
  id: string;
  productId: string;
  productNameSnapshot: string;
  productCodeSnapshot: string;
  quantity: number;
  unit: string;
  unitCost: number;
  estimatedCost: number;
};

export type Wastage = {
  id: WastageId;
  organizationId: string;
  wastageNumber: string;
  wastageDate: string;
  reason: WastageReason;
  status: WastageStatus;
  lines: WastageLineItem[];
  lineCount: number;
  totalUnits: number;
  totalWastageCost: number;
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

export type WastageListItem = {
  id: WastageId;
  wastageNumber: string;
  wastageDate: string;
  reason: WastageReason;
  lineCount: number;
  totalUnits: number;
  totalWastageCost: number;
  status: WastageStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type WastageListParams = {
  search?: string;
  page?: number;
  pageSize?: number;
};

export type WastageListResult = {
  items: WastageListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type WastageLineItemInput = {
  id?: string;
  productId: string;
  quantity: number;
};

export type CreateWastageInput = {
  wastageDate: string;
  reason: WastageReason;
  lines: WastageLineItemInput[];
  notes?: string | null;
};

export type UpdateWastageInput = {
  wastageDate?: string;
  reason?: WastageReason;
  lines?: WastageLineItemInput[];
  notes?: string | null;
};
