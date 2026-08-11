/**
 * Expands report field requirements with the universal header alias dictionary.
 * Used by report detection only — no vendor names, no import execution.
 */

import {
  SALES_HEADER_ALIASES,
  type SalesHeaderCanonicalField,
} from '@/lib/import/services/header-alias-dictionary';
import { normalizeHeaderLabel } from '@/lib/import/services/header-detection.service';
import type { ReportFieldRequirement } from '@/lib/import/reports/types';

const REPORT_KEY_TO_CANONICAL: Partial<Record<string, readonly SalesHeaderCanonicalField[]>> = {
  saleDate: ['saleDate'],
  customerName: ['customerName'],
  productName: ['productName'],
  productCode: ['productCode'],
  name: ['productName'],
  code: ['productCode'],
  quantity: ['quantity'],
  amount: ['amount'],
  sellingPrice: [],
  saleNumber: ['invoiceNumber'],
  unit: ['unit'],
  product: ['productName', 'productCode'],
};

export function buildExpandedAliasSet(requirement: ReportFieldRequirement): ReadonlySet<string> {
  const aliases = new Set<string>();

  for (const alias of requirement.aliases) {
    const normalized = normalizeHeaderLabel(alias);

    if (normalized) {
      aliases.add(normalized);
    }
  }

  const canonicalKeys = REPORT_KEY_TO_CANONICAL[requirement.key] ?? [];

  for (const canonical of canonicalKeys) {
    for (const alias of SALES_HEADER_ALIASES[canonical]) {
      const normalized = normalizeHeaderLabel(alias);

      if (normalized) {
        aliases.add(normalized);
      }
    }
  }

  return aliases;
}

/**
 * Header similarity in [0, 1]. Exact normalized match = 1.
 * Token-subset and containment matches support vendor label variants.
 */
export function scoreHeaderSimilarity(fileNormalized: string, aliasNormalized: string): number {
  if (!fileNormalized || !aliasNormalized) {
    return 0;
  }

  if (fileNormalized === aliasNormalized) {
    return 1;
  }

  const fileTokens = fileNormalized.split(' ').filter(Boolean);
  const aliasTokens = aliasNormalized.split(' ').filter(Boolean);

  if (aliasTokens.length > 0 && aliasTokens.every((token) => fileTokens.includes(token))) {
    return 0.92;
  }

  if (aliasTokens.length === 1 && fileTokens.length === 1) {
    return 0;
  }

  // File header must contain the alias (e.g. "Sales Qty" ⊃ "qty"), not the reverse —
  // otherwise catalog "Unit" falsely matches quantity alias "Unit Qty".
  if (
    aliasNormalized.length >= 3 &&
    fileNormalized.length >= aliasNormalized.length &&
    fileNormalized.includes(aliasNormalized)
  ) {
    return 0.9;
  }

  if (aliasTokens.length === 0) {
    return 0;
  }

  const overlap = aliasTokens.filter((token) => fileTokens.includes(token)).length;
  return overlap > 0 ? 0.55 + (0.35 * overlap) / aliasTokens.length : 0;
}

export const REPORT_HEADER_SIMILARITY_THRESHOLD = 0.88;
