import { z } from 'zod';

import { DEFAULT_PRODUCT_CATEGORIES } from '@/lib/domain/constants/product';

const productCodeRegex = /^[A-Za-z0-9-]+$/;

export const productFormSchema = z.object({
  code: z
    .string()
    .trim()
    .max(20, 'Code must be 20 characters or less')
    .regex(productCodeRegex, 'Code can only contain letters, numbers, and hyphens')
    .optional()
    .or(z.literal('')),
  name: z
    .string()
    .trim()
    .min(1, 'Product Name is required.')
    .max(120, 'Product Name must be 120 characters or less.'),
  category: z
    .string()
    .min(1, 'Category is required.')
    .refine(
      (value) =>
        (DEFAULT_PRODUCT_CATEGORIES as readonly string[]).includes(value) ||
        value.trim().length > 0,
      'Invalid category',
    ),
  sellingPrice: z
    .number({ error: 'Selling Price is required.' })
    .int('Selling Price must be a valid amount.')
    .positive('Selling Price must be greater than zero.'),
  description: z
    .string()
    .max(500, 'Description is too long')
    .optional()
    .nullable(),
  isActive: z.boolean(),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;

export const createProductSchema = productFormSchema;

export const updateProductSchema = productFormSchema.partial().extend({
  name: z
    .string()
    .trim()
    .min(1, 'Product Name is required.')
    .max(120, 'Product Name must be 120 characters or less.')
    .optional(),
  sellingPrice: z
    .number()
    .int('Selling Price must be a valid amount.')
    .positive('Selling Price must be greater than zero.')
    .optional(),
});

export const productListParamsSchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(['all', 'active', 'inactive']).default('active'),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(25),
});
