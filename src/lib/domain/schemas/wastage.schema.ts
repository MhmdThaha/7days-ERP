import { z } from 'zod';

import { DUPLICATE_PRODUCT_MESSAGE, WASTAGE_REASONS } from '@/lib/domain/constants/wastage';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const wastageLineItemSchema = z.object({
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

const wastageFormBaseSchema = z.object({
  wastageDate: z
    .string()
    .trim()
    .regex(dateRegex, 'Enter a valid wastage date.'),
  reason: z.enum(WASTAGE_REASONS, { error: 'Select a reason.' }),
  lines: z.array(wastageLineItemSchema).min(1, 'Add at least one product line.'),
  notes: z.string().max(1000, 'Notes are too long').optional().nullable(),
});

export const wastageFormSchema = wastageFormBaseSchema.superRefine((data, ctx) => {
  refineUniqueProducts(data.lines, ctx);
});

export type WastageFormValues = z.infer<typeof wastageFormSchema>;

export const createWastageSchema = wastageFormSchema;

export const updateWastageSchema = wastageFormBaseSchema
  .partial()
  .extend({
    wastageDate: z
      .string()
      .trim()
      .regex(dateRegex, 'Enter a valid wastage date.')
      .optional(),
    reason: z.enum(WASTAGE_REASONS).optional(),
    lines: z.array(wastageLineItemSchema).min(1, 'Add at least one product line.').optional(),
  })
  .superRefine((data, ctx) => {
    if (data.lines) {
      refineUniqueProducts(data.lines, ctx);
    }
  });

export const wastageListParamsSchema = z.object({
  search: z.string().trim().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(25),
});
