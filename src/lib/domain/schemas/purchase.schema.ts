import { z } from 'zod';

import {
  calculatePurchaseLineTotal,
  calculatePurchaseTotals,
  getPurchaseTotalsValidationError,
} from '@/lib/domain/calculations/purchase-pricing';
import { DUPLICATE_RAW_MATERIAL_MESSAGE } from '@/lib/domain/constants/purchase';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const purchaseLineItemSchema = z.object({
  id: z.string().optional(),
  rawMaterialId: z.string().min(1, 'Select a raw material.'),
  packCount: z
    .number({ error: 'Packs is required.' })
    .positive('Packs must be greater than zero.'),
  packSize: z
    .number({ error: 'Pack size is required.' })
    .positive('Pack size must be greater than zero.'),
  unit: z.string().min(1, 'Unit is required.'),
  packPrice: z
    .number({ error: 'Pack price is required.' })
    .int('Pack price must be a valid amount.')
    .positive('Pack price must be greater than zero.'),
});

function refineUniqueRawMaterials(
  lineItems: Array<{ rawMaterialId: string }>,
  ctx: z.RefinementCtx,
) {
  const seen = new Map<string, number>();

  lineItems.forEach((lineItem, index) => {
    const rawMaterialId = lineItem.rawMaterialId.trim();

    if (!rawMaterialId) {
      return;
    }

    if (seen.has(rawMaterialId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: DUPLICATE_RAW_MATERIAL_MESSAGE,
        path: ['lineItems', index, 'rawMaterialId'],
      });
      return;
    }

    seen.set(rawMaterialId, index);
  });
}

const purchaseFormBaseSchema = z.object({
  purchaseDate: z
    .string()
    .trim()
    .regex(dateRegex, 'Enter a valid purchase date.'),
  supplierName: z
    .string()
    .trim()
    .min(1, 'Supplier name is required.')
    .max(120, 'Supplier name must be 120 characters or less.'),
  invoiceNumber: z
    .string()
    .trim()
    .max(60, 'Invoice number must be 60 characters or less.')
    .optional()
    .nullable()
    .or(z.literal('')),
  paymentStatus: z.enum(['paid', 'credit']),
  lineItems: z.array(purchaseLineItemSchema).min(1, 'Add at least one line item.'),
  discountAmount: z
    .number({ error: 'Discount must be a valid amount.' })
    .int('Discount must be a valid amount.')
    .min(0, 'Discount cannot be negative.'),
  adjustmentAmount: z
    .number({ error: 'Adjustment must be a valid amount.' })
    .int('Adjustment must be a valid amount.'),
  notes: z.string().max(1000, 'Notes are too long').optional().nullable(),
});

function purchaseLineItemsSubtotal(
  lineItems: Array<{ packCount: number; packPrice: number }>,
): number {
  return lineItems.reduce((sum, lineItem) => {
    const packCount = Number(lineItem.packCount);
    const packPrice = Number(lineItem.packPrice);

    if (Number.isNaN(packCount) || Number.isNaN(packPrice)) {
      return sum;
    }

    return sum + calculatePurchaseLineTotal(packCount, packPrice);
  }, 0);
}

function refinePurchaseTotals(
  data: {
    lineItems: Array<{ packCount: number; packPrice: number }>;
    discountAmount?: number;
    adjustmentAmount?: number;
  },
  ctx: z.RefinementCtx,
) {
  const totals = calculatePurchaseTotals({
    subtotal: purchaseLineItemsSubtotal(data.lineItems),
    discountAmount: data.discountAmount,
    adjustmentAmount: data.adjustmentAmount,
  });
  const error = getPurchaseTotalsValidationError(totals);

  if (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: error.message,
      path: [error.field],
    });
  }
}

export const purchaseFormSchema = purchaseFormBaseSchema.superRefine((data, ctx) => {
  refineUniqueRawMaterials(data.lineItems, ctx);
  refinePurchaseTotals(data, ctx);
});

export type PurchaseFormValues = z.infer<typeof purchaseFormSchema>;

export const createPurchaseSchema = purchaseFormSchema;

export const updatePurchaseSchema = purchaseFormBaseSchema
  .partial()
  .extend({
    purchaseDate: z
      .string()
      .trim()
      .regex(dateRegex, 'Enter a valid purchase date.')
      .optional(),
    supplierName: z
      .string()
      .trim()
      .min(1, 'Supplier name is required.')
      .max(120, 'Supplier name must be 120 characters or less.')
      .optional(),
    lineItems: z.array(purchaseLineItemSchema).min(1, 'Add at least one line item.').optional(),
    discountAmount: z
      .number({ error: 'Discount must be a valid amount.' })
      .int('Discount must be a valid amount.')
      .min(0, 'Discount cannot be negative.')
      .optional(),
    adjustmentAmount: z
      .number({ error: 'Adjustment must be a valid amount.' })
      .int('Adjustment must be a valid amount.')
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.lineItems) {
      refineUniqueRawMaterials(data.lineItems, ctx);
      refinePurchaseTotals(
        {
          lineItems: data.lineItems,
          discountAmount: data.discountAmount,
          adjustmentAmount: data.adjustmentAmount,
        },
        ctx,
      );
    }
  });

export const purchaseListParamsSchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(['all', 'draft', 'received']).optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(25),
});

export const purchasePageCursorSchema = z.object({
  purchaseDate: z.string().min(1),
  purchaseNumber: z.string().min(1),
});

export const purchaseListPageParamsSchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(['all', 'draft', 'received']).optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(25),
  position: z.enum(['first', 'next', 'prev', 'last']).default('first'),
  cursor: purchasePageCursorSchema.nullable().optional(),
});
