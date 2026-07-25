/**
 * Sale Import Product Resolution.
 *
 * Pure transformation: grouped sale candidates → groups with each line
 * item linked to an existing BakeryOS product (when found).
 *
 * Runs AFTER grouping and BEFORE conflict detection / commit.
 * No product creation, inventory changes, or Firestore writes.
 */

import type { Firestore } from 'firebase-admin/firestore';

import type { NormalizedValue, ValidationIssue } from '@/lib/import/engine/types';
import {
  normalizeProductCode,
  normalizeProductName,
  type ExistingProductMatch,
  type ProductImportIndex,
} from '@/lib/import/services/conflict.service';
import type {
  SaleImportGroup,
  SaleImportLineItem,
} from '@/lib/import/services/sale-import-grouping.service';
import type { ProductDocument } from '@/lib/repositories/product.repository';

export const SALE_PRODUCT_RESOLUTION_ISSUE_CODES = {
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  AMBIGUOUS_PRODUCT_NAME: 'AMBIGUOUS_PRODUCT_NAME',
} as const;

/** One sale line item with an optional resolved BakeryOS product. */
export type ResolvedSaleImportLineItem = SaleImportLineItem & {
  resolvedProduct: ExistingProductMatch | null;
};

/** One grouped sale with product-resolved line items. */
export type ResolvedSaleImportGroup = Omit<SaleImportGroup, 'lines'> & {
  lines: readonly ResolvedSaleImportLineItem[];
};

export type SaleProductResolutionOptions = {
  /**
   * Normalized product names shared by more than one BakeryOS product.
   * Name-based matching is rejected for these keys.
   */
  ambiguousNames?: ReadonlySet<string>;
};

function readTrimmedString(value: NormalizedValue | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}

function readProductCode(values: Readonly<Record<string, NormalizedValue>>): string | null {
  return readTrimmedString(values['productCode']);
}

function readProductName(values: Readonly<Record<string, NormalizedValue>>): string | null {
  return readTrimmedString(values['productName']);
}

function resolutionIssue(
  code: string,
  message: string,
  field: string,
  rowNumber: number,
): ValidationIssue {
  return {
    severity: 'error',
    code,
    message: `${message} (row ${rowNumber}).`,
    field,
  };
}

function productNotFoundIssue(
  code: string | null,
  name: string | null,
  rowNumber: number,
): ValidationIssue {
  const reference =
    code && name
      ? `Product Code "${code}" or Product Name "${name}"`
      : code
        ? `Product Code "${code}"`
        : `Product Name "${name}"`;

  return resolutionIssue(
    SALE_PRODUCT_RESOLUTION_ISSUE_CODES.PRODUCT_NOT_FOUND,
    `${reference} was not found in BakeryOS`,
    code ? 'productCode' : 'productName',
    rowNumber,
  );
}

function ambiguousProductNameIssue(name: string, rowNumber: number): ValidationIssue {
  return resolutionIssue(
    SALE_PRODUCT_RESOLUTION_ISSUE_CODES.AMBIGUOUS_PRODUCT_NAME,
    `Product Name "${name}" matches more than one product in BakeryOS`,
    'productName',
    rowNumber,
  );
}

function withResolutionFailure(
  line: SaleImportLineItem,
  issue: ValidationIssue,
): ResolvedSaleImportLineItem {
  return {
    ...line,
    issues: [...line.issues, issue],
    status: 'error',
    resolvedProduct: null,
  };
}

function withResolvedProduct(
  line: SaleImportLineItem,
  product: ExistingProductMatch,
): ResolvedSaleImportLineItem {
  return {
    ...line,
    resolvedProduct: product,
  };
}

/**
 * Resolves one line item against the in-memory product index.
 * Product Code is tried first; Product Name is the fallback.
 */
export function resolveSaleImportLineItem(
  line: SaleImportLineItem,
  productIndex: ProductImportIndex,
  ambiguousNames: ReadonlySet<string> = new Set(),
): ResolvedSaleImportLineItem {
  const code = readProductCode(line.values);
  const name = readProductName(line.values);

  if (code) {
    const codeMatch = productIndex.byCode.get(normalizeProductCode(code));

    if (codeMatch) {
      return withResolvedProduct(line, codeMatch);
    }
  }

  if (name) {
    const normalizedName = normalizeProductName(name);

    if (ambiguousNames.has(normalizedName)) {
      return withResolutionFailure(line, ambiguousProductNameIssue(name, line.rowNumber));
    }

    const nameMatch = productIndex.byName.get(normalizedName);

    if (nameMatch) {
      return withResolvedProduct(line, nameMatch);
    }
  }

  if (code || name) {
    return withResolutionFailure(line, productNotFoundIssue(code, name, line.rowNumber));
  }

  return {
    ...line,
    resolvedProduct: null,
  };
}

/**
 * Resolves products for every line in grouped sale import candidates.
 * Group structure, row numbers, values, and existing issues are preserved.
 */
export function resolveSaleImportProducts(
  groups: readonly SaleImportGroup[],
  productIndex: ProductImportIndex,
  options: SaleProductResolutionOptions = {},
): ResolvedSaleImportGroup[] {
  const ambiguousNames = options.ambiguousNames ?? new Set<string>();

  return groups.map((group) => ({
    groupKey: group.groupKey,
    rowNumbers: group.rowNumbers,
    header: group.header,
    groupIssues: group.groupIssues,
    lines: group.lines.map((line) =>
      resolveSaleImportLineItem(line, productIndex, ambiguousNames),
    ),
  }));
}

/** Mirrors conflict.service index building so one Firestore read is enough. */
export function buildProductImportIndexFromDocs(
  docs: ReadonlyArray<{ id: string; data: ProductDocument }>,
): ProductImportIndex {
  const byName = new Map<string, ExistingProductMatch>();
  const byCode = new Map<string, ExistingProductMatch>();

  for (const doc of docs) {
    const data = doc.data;
    const nameKey = normalizeProductName(data.name);

    if (!byName.has(nameKey)) {
      byName.set(nameKey, { id: doc.id, name: data.name, code: data.code });
    }

    const code = data.code?.trim();

    if (code) {
      const codeKey = normalizeProductCode(code);

      if (!byCode.has(codeKey)) {
        byCode.set(codeKey, { id: doc.id, name: data.name, code: data.code });
      }
    }
  }

  return { byName, byCode };
}

/** Builds normalized-name keys that map to more than one BakeryOS product. */
export function buildAmbiguousProductNameSet(
  docs: ReadonlyArray<{ id: string; data: ProductDocument }>,
): ReadonlySet<string> {
  const counts = new Map<string, number>();

  for (const doc of docs) {
    const key = normalizeProductName(doc.data.name);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
}

/**
 * Loads the org product index once, detects ambiguous names, then resolves.
 */
export async function resolveSaleImportProductsForOrg(
  groups: readonly SaleImportGroup[],
  db: Firestore,
  orgId: string,
): Promise<ResolvedSaleImportGroup[]> {
  const snapshot = await db
    .collection('organizations')
    .doc(orgId)
    .collection('products')
    .where('deletedAt', '==', null)
    .get();

  const docs = snapshot.docs.map((doc) => ({
    id: doc.id,
    data: doc.data() as ProductDocument,
  }));

  const productIndex = buildProductImportIndexFromDocs(docs);
  const ambiguousNames = buildAmbiguousProductNameSet(docs);

  return resolveSaleImportProducts(groups, productIndex, { ambiguousNames });
}
