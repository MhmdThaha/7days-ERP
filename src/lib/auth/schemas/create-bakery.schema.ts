import { z } from 'zod';

export const createBakeryFormSchema = z.object({
  bakeryName: z
    .string()
    .trim()
    .min(2, 'Bakery name must be at least 2 characters.')
    .max(80, 'Bakery name must be 80 characters or fewer.'),
});

export type CreateBakeryFormValues = z.infer<typeof createBakeryFormSchema>;
