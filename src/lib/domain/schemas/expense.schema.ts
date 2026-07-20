import { z } from 'zod';

import { EXPENSE_CATEGORIES } from '@/lib/domain/constants/expense';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const expenseFormSchema = z.object({
  expenseDate: z
    .string()
    .trim()
    .regex(dateRegex, 'Enter a valid expense date.'),
  category: z.enum(EXPENSE_CATEGORIES, { error: 'Select a category.' }),
  amount: z
    .number({ error: 'Amount is required.' })
    .int('Amount must be a valid amount.')
    .positive('Amount must be greater than zero.'),
  notes: z.string().max(1000, 'Notes are too long').optional().nullable(),
});

export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

export const createExpenseSchema = expenseFormSchema;

export const updateExpenseSchema = expenseFormSchema.partial().extend({
  expenseDate: z
    .string()
    .trim()
    .regex(dateRegex, 'Enter a valid expense date.')
    .optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  amount: z
    .number({ error: 'Amount is required.' })
    .int('Amount must be a valid amount.')
    .positive('Amount must be greater than zero.')
    .optional(),
});

export const expenseListParamsSchema = z.object({
  search: z.string().trim().optional(),
  category: z.enum([...EXPENSE_CATEGORIES, 'all'] as const).optional(),
  status: z.enum(['all', 'draft', 'completed']).optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(25),
});
