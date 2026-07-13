import type { RecipeFormValues } from '@/lib/domain/schemas/recipe.schema';

export type RecipeFieldError = {
  field: keyof RecipeFormValues | `ingredients.${number}.rawMaterialId` | `ingredients.${number}.quantity`;
  message: string;
};

export function mapRecipeActionError(code?: string): RecipeFieldError | null {
  switch (code) {
    case 'DUPLICATE_CODE':
      return { field: 'recipeCode', message: 'Recipe code already in use.' };
    case 'DUPLICATE_ACTIVE_RECIPE':
      return { field: 'productId', message: 'This product already has an active recipe.' };
    case 'PRODUCT_INACTIVE':
      return { field: 'productId', message: 'Cannot create a recipe for an inactive product.' };
    default:
      return null;
  }
}

export function focusRecipeFormField(field: RecipeFieldError['field']): void {
  const fieldId =
    field === 'productId' || field.startsWith('ingredients.')
      ? field.replace('ingredients.', 'ingredient-')
      : field;

  const element = document.getElementById(fieldId);

  if (element instanceof HTMLElement) {
    element.focus();
  }
}
