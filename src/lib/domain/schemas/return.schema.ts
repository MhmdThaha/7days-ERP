import { z } from 'zod';

import { DUPLICATE_PRODUCT_MESSAGE, RETURN_REASONS } from '@/lib/domain/constants/return';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const returnLineItemSchema = z.object({
  id: z.string().optional(),
  productId: z.string().min(1, 'Select a product.'),
  quantity: z
    .number({ error: 'Quantity is required.' })
    .positive('Quantity must be greater than zero.'),
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

const returnFormBaseSchema = z.object({
  returnDate: z
    .string()
    .trim()
    .regex(dateRegex, 'Enter a valid return date.'),
  reason: z.enum(RETURN_REASONS, { error: 'Select a reason.' }),
  lines: z.array(returnLineItemSchema).min(1, 'Add at least one product line.'),
  notes: z.string().max(1000, 'Notes are too long').optional().nullable(),
});

export const returnFormSchema = returnFormBaseSchema.superRefine((data, ctx) => {
  refineUniqueProducts(data.lines, ctx);
});

export type ReturnFormValues = z.infer<typeof returnFormSchema>;

export const createReturnSchema = returnFormSchema;

export const updateReturnSchema = returnFormBaseSchema
  .partial()
  .extend({
    returnDate: z
      .string()
      .trim()
      .regex(dateRegex, 'Enter a valid return date.')
      .optional(),
    reason: z.enum(RETURN_REASONS).optional(),
    lines: z.array(returnLineItemSchema).min(1, 'Add at least one product line.').optional(),
  })
  .superRefine((data, ctx) => {
    if (data.lines) {
      refineUniqueProducts(data.lines, ctx);
    }
  });

export const returnListParamsSchema = z.object({
  search: z.string().trim().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(25),
});
