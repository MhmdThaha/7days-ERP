import type { ExpenseCategory } from '@/types/expense';

export const EXPENSE_NUMBER_PREFIX = 'EXP';

export const EXPENSE_PAGE_SIZE = 25;

export const EXPENSE_STATUSES = ['draft', 'completed'] as const;

export const EXPENSE_CATEGORIES = [
  'rent',
  'salary',
  'electricity',
  'gas',
  'fuel',
  'maintenance',
  'internet',
  'office_supplies',
  'miscellaneous',
] as const;

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  rent: 'Rent',
  salary: 'Salary',
  electricity: 'Electricity',
  gas: 'Gas',
  fuel: 'Fuel',
  maintenance: 'Maintenance',
  internet: 'Internet',
  office_supplies: 'Office Supplies',
  miscellaneous: 'Miscellaneous',
};
