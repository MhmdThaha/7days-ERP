import { z } from 'zod';

import { DUPLICATE_PRODUCT_MESSAGE } from '@/lib/domain/constants/production';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const productionLineItemSchema = z.object({
  id: z.string().optional(),
  productId: z.string().min(1, 'Select a product.'),
  quantity: z
    .number({ error: 'Quantity is required.' })
    .positive('Quantity must be greater than zero.'),
  unit: z.string().min(1, 'Unit is required.'),
});

function refineUniqueProducts(
  lines: Array<{ productId: string }>,
  ctx: z.RefinementCtx,
) {
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

const productionFormBaseSchema = z.object({
  productionDate: z
    .string()
    .trim()
    .regex(dateRegex, 'Enter a valid production date.'),
  lines: z.array(productionLineItemSchema).min(1, 'Add at least one product line.'),
  notes: z.string().max(1000, 'Notes are too long').optional().nullable(),
});

export const productionFormSchema = productionFormBaseSchema.superRefine((data, ctx) => {
  refineUniqueProducts(data.lines, ctx);
});

export type ProductionFormValues = z.infer<typeof productionFormSchema>;

export const createProductionSchema = productionFormSchema;

export const updateProductionSchema = productionFormBaseSchema
  .partial()
  .extend({
    productionDate: z
      .string()
      .trim()
      .regex(dateRegex, 'Enter a valid production date.')
      .optional(),
    lines: z.array(productionLineItemSchema).min(1, 'Add at least one product line.').optional(),
    acceptedStaleRecipe: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.lines) {
      refineUniqueProducts(data.lines, ctx);
    }
  });

export const productionListParamsSchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(['all', 'draft', 'completed']).optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(25),
});

const productionPageCursorSchema = z.object({
  productionDate: z.string().min(1),
  productionNumber: z.string().min(1),
});

export const productionListPageParamsSchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(['all', 'draft', 'completed']).optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(25),
  position: z.enum(['first', 'next', 'prev', 'last']).default('first'),
  cursor: productionPageCursorSchema.nullable().optional(),
});
