export type ExpenseId = string;

export type ExpenseCategory =
  | 'rent'
  | 'salary'
  | 'electricity'
  | 'gas'
  | 'fuel'
  | 'maintenance'
  | 'internet'
  | 'office_supplies'
  | 'miscellaneous';

export type ExpenseStatus = 'draft' | 'completed';

export type ExpenseStatusFilter = 'all' | 'draft' | 'completed';

export type Expense = {
  id: ExpenseId;
  organizationId: string;
  expenseNumber: string;
  expenseDate: string;
  category: ExpenseCategory;
  amount: number;
  status: ExpenseStatus;
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

export type ExpenseListItem = {
  id: ExpenseId;
  expenseNumber: string;
  expenseDate: string;
  category: ExpenseCategory;
  amount: number;
  status: ExpenseStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type ExpenseListParams = {
  search?: string;
  category?: ExpenseCategory | 'all';
  status?: ExpenseStatusFilter;
  page?: number;
  pageSize?: number;
};

export type ExpenseListResult = {
  items: ExpenseListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type CreateExpenseInput = {
  expenseDate: string;
  category: ExpenseCategory;
  amount: number;
  notes?: string | null;
};

export type UpdateExpenseInput = {
  expenseDate?: string;
  category?: ExpenseCategory;
  amount?: number;
  notes?: string | null;
};
