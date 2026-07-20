export const PRODUCTION_NUMBER_PREFIX = 'PRD';

export const PRODUCTION_PAGE_SIZE = 25;

export const PRODUCTION_STATUSES = ['draft', 'completed'] as const;

export const DUPLICATE_PRODUCT_MESSAGE =
  'This product is already added to this production.';

/** Until recipe yield is defined on Recipe Master, assume 1 product unit per recipe batch. */
export const DEFAULT_RECIPE_YIELD_QUANTITY = 1;
