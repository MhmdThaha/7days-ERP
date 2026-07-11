import { z } from 'zod';

import {
  DEFAULT_RAW_MATERIAL_CATEGORIES,
  DEFAULT_RAW_MATERIAL_UNITS,
} from '@/lib/domain/constants/raw-material';

const rawMaterialCodeRegex = /^[A-Za-z0-9-]+$/;

export const rawMaterialFormSchema = z.object({
  code: z
    .string()
    .trim()
    .max(20, 'Code must be 20 characters or less')
    .regex(rawMaterialCodeRegex, 'Code can only contain letters, numbers, and hyphens')
    .optional()
    .or(z.literal('')),
  name: z
    .string()
    .trim()
    .min(1, 'Raw material name is required.')
    .max(120, 'Raw material name must be 120 characters or less.'),
  category: z
    .string()
    .min(1, 'Category is required.')
    .refine(
      (value) =>
        (DEFAULT_RAW_MATERIAL_CATEGORIES as readonly string[]).includes(value) ||
        value.trim().length > 0,
      'Invalid category',
    ),
  unit: z
    .string()
    .min(1, 'Unit is required.')
    .refine(
      (value) =>
        (DEFAULT_RAW_MATERIAL_UNITS as readonly string[]).includes(value) ||
        value.trim().length > 0,
      'Invalid unit',
    ),
  reorderLevel: z
    .number({ error: 'Reorder level must be a valid number.' })
    .int('Reorder level must be a whole number.')
    .min(0, 'Reorder level cannot be negative.')
    .nullable()
    .optional(),
  description: z
    .string()
    .max(500, 'Description is too long')
    .optional()
    .nullable(),
  isActive: z.boolean(),
});

export type RawMaterialFormValues = z.infer<typeof rawMaterialFormSchema>;

export const createRawMaterialSchema = rawMaterialFormSchema;

export const updateRawMaterialSchema = rawMaterialFormSchema.partial().extend({
  name: z
    .string()
    .trim()
    .min(1, 'Raw material name is required.')
    .max(120, 'Raw material name must be 120 characters or less.')
    .optional(),
});

export const rawMaterialListParamsSchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(['all', 'active', 'inactive']).default('active'),
  category: z.string().trim().optional(),
  lowStockOnly: z.boolean().default(false),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(25),
});
