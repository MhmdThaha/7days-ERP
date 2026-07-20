import { z } from 'zod';

import { DUPLICATE_PRODUCT_MESSAGE } from '@/lib/domain/constants/sale';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const saleLineItemSchema = z.object({
  id: z.string().optional(),
  productId: z.string().min(1, 'Select a product.'),
  quantity: z
    .number({ error: 'Quantity is required.' })
    .positive('Quantity must be greater than zero.'),
  sellingPrice: z
    .number({ error: 'Selling price is required.' })
    .int('Selling price must be a valid amount.')
    .nonnegative('Selling price cannot be negative.'),
});

function refineUniqueProducts(lines: Array<{ productId: string }>, ctx: z.RefinementCtx) {
  const seen = new Map<string, number>();

  lines.forEach((line, index) => {
    const productId = line.productId.trim();

    if (!productId) {
      return;
    }

    if (seen.has(productId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: DUPLICATE_PRODUCT_MESSAGE,
        path: ['lines', index, 'productId'],
      });
      return;
    }

    seen.set(productId, index);
  });
}

const saleFormBaseSchema = z.object({
  saleDate: z
    .string()
    .trim()
    .regex(dateRegex, 'Enter a valid sale date.'),
  customerName: z
    .string()
    .trim()
    .max(120, 'Customer name must be 120 characters or less.')
    .optional()
    .nullable()
    .or(z.literal('')),
  lines: z.array(saleLineItemSchema).min(1, 'Add at least one product line.'),
  notes: z.string().max(1000, 'Notes are too long').optional().nullable(),
});

export const saleFormSchema = saleFormBaseSchema.superRefine((data, ctx) => {
  refineUniqueProducts(data.lines, ctx);
});

export type SaleFormValues = z.infer<typeof saleFormSchema>;

export const createSaleSchema = saleFormSchema;

export const updateSaleSchema = saleFormBaseSchema
  .partial()
  .extend({
    saleDate: z
      .string()
      .trim()
      .regex(dateRegex, 'Enter a valid sale date.')
      .optional(),
    customerName: z
      .string()
      .trim()
      .max(120, 'Customer name must be 120 characters or less.')
      .optional()
      .nullable()
      .or(z.literal(''))
      .optional(),
    lines: z.array(saleLineItemSchema).min(1, 'Add at least one product line.').optional(),
  })
  .superRefine((data, ctx) => {
    if (data.lines) {
      refineUniqueProducts(data.lines, ctx);
    }
  });

export const saleListParamsSchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(['all', 'draft', 'completed']).optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(25),
});
