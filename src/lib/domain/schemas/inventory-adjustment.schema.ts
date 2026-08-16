import { z } from 'zod';

import { INVENTORY_ADJUSTMENT_REASONS } from '@/lib/domain/constants/inventory-adjustment';

export const confirmInventoryAdjustmentSchema = z
  .object({
    itemType: z.enum(['raw_material', 'finished_product']),
    itemId: z.string().trim().min(1, 'Select an item.'),
    physicalCount: z
      .number({ error: 'Enter the physical counted quantity.' })
      .finite('Enter a valid physical count.')
      .min(0, 'Physical count cannot be negative.'),
    reason: z.enum(INVENTORY_ADJUSTMENT_REASONS, { error: 'Select a reason.' }),
    notes: z.string().max(1000, 'Notes are too long.').optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.reason === 'other' && !data.notes?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Add a note when the reason is Other.',
        path: ['notes'],
      });
    }
  });

export type ConfirmInventoryAdjustmentFormValues = z.infer<
  typeof confirmInventoryAdjustmentSchema
>;
