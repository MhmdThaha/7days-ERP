import { z } from 'zod';

const recipeCodeRegex = /^[A-Za-z0-9-]+$/;

export const recipeIngredientSchema = z.object({
  rawMaterialId: z.string().min(1, 'Raw material is required.'),
  quantity: z
    .number({ error: 'Quantity is required.' })
    .positive('Quantity must be greater than zero.'),
  unit: z.string().min(1, 'Unit is required.'),
});

const optionalPositiveNumber = z
  .number({ error: 'Must be a number.' })
  .positive('Must be greater than zero.')
  .nullable();

const requiredPositiveMakes = z
  .number({ error: 'Makes is required.' })
  .positive('Makes must be greater than zero.');

export const recipeFormSchema = z
  .object({
    productId: z.string().min(1, 'Product is required.'),
    recipeCode: z
      .string()
      .trim()
      .max(20, 'Code must be 20 characters or less')
      .regex(recipeCodeRegex, 'Code can only contain letters, numbers, and hyphens')
      .optional()
      .or(z.literal('')),
    recipeName: z
      .string()
      .trim()
      .min(1, 'Recipe name is required.')
      .max(120, 'Recipe name must be 120 characters or less.'),
    batchOutputQuantity: requiredPositiveMakes,
    targetWeightGrams: optionalPositiveNumber,
    ingredients: z.array(recipeIngredientSchema).min(1, 'Add at least one ingredient.'),
    notes: z.string().max(1000, 'Notes are too long').optional().nullable(),
    isActive: z.boolean(),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();

    data.ingredients.forEach((ingredient, index) => {
      if (seen.has(ingredient.rawMaterialId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Duplicate raw material — combine quantities.',
          path: ['ingredients', index, 'rawMaterialId'],
        });
      }

      seen.add(ingredient.rawMaterialId);
    });
  });

export type RecipeFormValues = z.infer<typeof recipeFormSchema>;

export const createRecipeSchema = recipeFormSchema;

export const updateRecipeSchema = z
  .object({
    recipeName: z
      .string()
      .trim()
      .min(1, 'Recipe name is required.')
      .max(120, 'Recipe name must be 120 characters or less.')
      .optional(),
    batchOutputQuantity: requiredPositiveMakes.optional(),
    targetWeightGrams: optionalPositiveNumber.optional(),
    ingredients: z
      .array(recipeIngredientSchema)
      .min(1, 'Add at least one ingredient.')
      .optional(),
    notes: z.string().max(1000, 'Notes are too long').optional().nullable(),
    isActive: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.ingredients) {
      return;
    }

    const seen = new Set<string>();

    data.ingredients.forEach((ingredient, index) => {
      if (seen.has(ingredient.rawMaterialId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Duplicate raw material — combine quantities.',
          path: ['ingredients', index, 'rawMaterialId'],
        });
      }

      seen.add(ingredient.rawMaterialId);
    });
  });

export const recipeListParamsSchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(['all', 'active', 'inactive']).default('active'),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(25),
});
