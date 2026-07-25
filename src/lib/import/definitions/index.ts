/**
 * Entity Import Definition registry.
 *
 * One entry per importable entity. The orchestration layer (later phase)
 * looks up a definition by entity type and feeds its parts into the
 * generic engine:
 *
 *   columns    → applyMapping / normalizeRows / validateRows
 *   validation → validateRows
 *
 * Adding Customers, Suppliers, Sales, or Purchases later means adding one
 * definition file and one registry entry — no engine changes.
 */

import type { ColumnDefinition, ValidationOptions } from '@/lib/import/engine/types';

import { productImportDefinition } from '@/lib/import/definitions/product.definition';
import { saleImportDefinition } from '@/lib/import/definitions/sale.definition';

/** Contract every entity import definition must satisfy. */
export type EntityImportDefinition = {
  /** Stable key, e.g. "product". Used by sessions and saved profiles. */
  entityType: string;
  /** Human-readable plural label for UI, e.g. "Products". */
  label: string;
  /** Target columns the engine maps, normalizes, and validates against. */
  columns: readonly ColumnDefinition[];
  /** Entity business rules, passed to the engine's validator stage. */
  validation: ValidationOptions;
};

export const IMPORT_DEFINITIONS = {
  product: productImportDefinition,
  sale: saleImportDefinition,
} as const satisfies Record<string, EntityImportDefinition>;

export type ImportEntityType = keyof typeof IMPORT_DEFINITIONS;

/** Looks up a definition; returns undefined for unknown entity types. */
export function getImportDefinition(
  entityType: string,
): EntityImportDefinition | undefined {
  return (IMPORT_DEFINITIONS as Record<string, EntityImportDefinition>)[entityType];
}

export { productImportDefinition } from '@/lib/import/definitions/product.definition';
export { saleImportDefinition } from '@/lib/import/definitions/sale.definition';
