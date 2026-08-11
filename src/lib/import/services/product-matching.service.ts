/**
 * Product Matching Engine — classifies one imported row against a BakeryOS catalog.
 *
 * Pure classification only: no sales creation, inventory changes, product creation,
 * or Firestore writes. Reusable by Sales Import, Purchase Import, and future modules.
 */

// ---------------------------------------------------------------------------
// Status & result model
// ---------------------------------------------------------------------------

export const PRODUCT_MATCH_STATUS = {
  MATCHED: 'MATCHED',
  NOT_FOUND: 'NOT_FOUND',
  MULTIPLE_MATCHES: 'MULTIPLE_MATCHES',
  NEEDS_CONFIRMATION: 'NEEDS_CONFIRMATION',
  SYSTEM_CONFIGURATION_ERROR: 'SYSTEM_CONFIGURATION_ERROR',
} as const;

export type ProductMatchStatus =
  (typeof PRODUCT_MATCH_STATUS)[keyof typeof PRODUCT_MATCH_STATUS];

export type ProductMatchWarning = {
  code: 'UNIT_MISMATCH';
  message: string;
  importUnit: string;
  catalogUnit: string;
};

export type ProductMatchCandidate = {
  productId: string;
  productName: string;
  confidence: number;
};

export type ProductMatchResult = {
  status: ProductMatchStatus;
  matchedProductId: string | null;
  matchedProductName: string | null;
  /** Confidence in [0, 100]. */
  confidence: number;
  reason: string;
  warnings?: readonly ProductMatchWarning[];
  candidates?: readonly ProductMatchCandidate[];
};

// ---------------------------------------------------------------------------
// Catalog & input
// ---------------------------------------------------------------------------

/** One BakeryOS product eligible for matching (caller supplies from read-only catalog load). */
export type ProductMatchCatalogEntry = {
  id: string;
  name: string;
  code: string;
  unit?: string;
  isActive: boolean;
  deletedAt?: Date | string | null;
};

/** Normalized import-side label → BakeryOS product id (read-only lookup; not persisted here). */
export type SavedProductNameMapping = ReadonlyMap<string, string>;

export type ProductMatchInput = {
  productName?: string | null;
  productCode?: string | null;
  unit?: string | null;
};

export type ProductMatchCatalog = {
  products: readonly ProductMatchCatalogEntry[];
  byCode: ReadonlyMap<string, readonly ProductMatchCatalogEntry[]>;
  byExactName: ReadonlyMap<string, readonly ProductMatchCatalogEntry[]>;
  duplicateCodes: ReadonlySet<string>;
  duplicateExactNames: ReadonlySet<string>;
};

export type MatchProductOptions = {
  /** Previously saved import-name → product mappings (normalized keys). */
  savedMappings?: SavedProductNameMapping;
  /** Minimum fuzzy score to consider a candidate. Defaults to 70. */
  fuzzyMinConfidence?: number;
};

export const PRODUCT_MATCH_CONFIDENCE = {
  BARCODE: 100,
  SAVED_MAPPING: 100,
  EXACT_NAME: 98,
  FUZZY_MIN: 70,
  FUZZY_MAX: 95,
  NOT_FOUND: 0,
} as const;

const DEFAULT_FUZZY_MIN = PRODUCT_MATCH_CONFIDENCE.FUZZY_MIN;
const FUZZY_TIE_BAND = 5;

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/** Barcode / product code — trim + uppercase (matches product repository lookups). */
export function normalizeProductMatchCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Product name normalization for matching:
 * trim, lowercase, collapse whitespace, strip punctuation, normalize unicode marks.
 */
export function normalizeProductMatchName(name: string): string {
  return name
    .replace(/[\u2122\u00ae\u00a9]/g, ' ')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[[({][^)\]}]*[\])}]/g, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeUnit(unit: string): string {
  return unit.trim().toLowerCase();
}

function readTrimmed(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}

function isDeleted(entry: ProductMatchCatalogEntry): boolean {
  return entry.deletedAt != null && entry.deletedAt !== '';
}

// ---------------------------------------------------------------------------
// Catalog index
// ---------------------------------------------------------------------------

export function buildProductMatchCatalog(
  entries: readonly ProductMatchCatalogEntry[],
): ProductMatchCatalog {
  const live = entries.filter((entry) => !isDeleted(entry));
  const byCode = new Map<string, ProductMatchCatalogEntry[]>();
  const byExactName = new Map<string, ProductMatchCatalogEntry[]>();

  for (const entry of live) {
    const code = readTrimmed(entry.code);

    if (code) {
      const codeKey = normalizeProductMatchCode(code);
      const bucket = byCode.get(codeKey) ?? [];
      bucket.push(entry);
      byCode.set(codeKey, bucket);
    }

    const nameKey = normalizeProductMatchName(entry.name);
    const nameBucket = byExactName.get(nameKey) ?? [];
    nameBucket.push(entry);
    byExactName.set(nameKey, nameBucket);
  }

  const duplicateCodes = new Set<string>();
  const duplicateExactNames = new Set<string>();

  for (const [key, bucket] of byCode) {
    if (bucket.length > 1) {
      duplicateCodes.add(key);
    }
  }

  for (const [key, bucket] of byExactName) {
    if (bucket.length > 1) {
      duplicateExactNames.add(key);
    }
  }

  return {
    products: live,
    byCode,
    byExactName,
    duplicateCodes,
    duplicateExactNames,
  };
}

// ---------------------------------------------------------------------------
// Similarity scoring (0–100)
// ---------------------------------------------------------------------------

function levenshteinDistance(a: string, b: string): number {
  if (a === b) {
    return 0;
  }

  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );

  for (let row = 0; row < rows; row += 1) {
    matrix[row]![0] = row;
  }

  for (let col = 0; col < cols; col += 1) {
    matrix[0]![col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1;
      matrix[row]![col] = Math.min(
        matrix[row - 1]![col]! + 1,
        matrix[row]![col - 1]! + 1,
        matrix[row - 1]![col - 1]! + cost,
      );
    }
  }

  return matrix[a.length]![b.length]!;
}

export function scoreProductNameSimilarity(importName: string, catalogName: string): number {
  const importNorm = normalizeProductMatchName(importName);
  const catalogNorm = normalizeProductMatchName(catalogName);

  if (!importNorm || !catalogNorm) {
    return 0;
  }

  if (importNorm === catalogNorm) {
    return 100;
  }

  const importTokens = importNorm.split(' ').filter(Boolean);
  const catalogTokens = catalogNorm.split(' ').filter(Boolean);

  const shorter = importNorm.length <= catalogNorm.length ? importNorm : catalogNorm;
  const longer = importNorm.length > catalogNorm.length ? importNorm : catalogNorm;

  if (longer.includes(shorter) && shorter.length >= 3) {
    const containmentScore = Math.round((shorter.length / longer.length) * 95);

    return clampConfidence(Math.max(PRODUCT_MATCH_CONFIDENCE.FUZZY_MIN, containmentScore));
  }

  if (importTokens.length === 1 && catalogTokens.includes(importTokens[0]!)) {
    return clampConfidence(75 + Math.round((10 * importTokens.length) / catalogTokens.length));
  }

  const overlap = importTokens.filter((token) => catalogTokens.includes(token)).length;

  if (overlap >= 2 && importTokens.length >= 2) {
    const importCoverage = overlap / importTokens.length;
    const tokenScore = Math.round(
      PRODUCT_MATCH_CONFIDENCE.FUZZY_MIN + importCoverage * 20,
    );

    return clampConfidence(Math.max(tokenScore, ratioScoreFromNames(importNorm, catalogNorm)));
  }

  return clampConfidence(ratioScoreFromNames(importNorm, catalogNorm));
}

function ratioScoreFromNames(importNorm: string, catalogNorm: string): number {
  const maxLen = Math.max(importNorm.length, catalogNorm.length);

  if (maxLen === 0) {
    return 0;
  }

  const distance = levenshteinDistance(importNorm, catalogNorm);

  return Math.round((1 - distance / maxLen) * 100);
}

// ---------------------------------------------------------------------------
// Matcher
// ---------------------------------------------------------------------------

export function matchProduct(
  input: ProductMatchInput,
  catalog: ProductMatchCatalog,
  options: MatchProductOptions = {},
): ProductMatchResult {
  const fuzzyMin = options.fuzzyMinConfidence ?? DEFAULT_FUZZY_MIN;
  const code = readTrimmed(input.productCode ?? null);
  const name = readTrimmed(input.productName ?? null);
  const importUnit = readTrimmed(input.unit ?? null);

  if (!code && !name) {
    return notFound('Empty product name and barcode');
  }

  if (code) {
    const codeKey = normalizeProductMatchCode(code);

    if (catalog.duplicateCodes.has(codeKey)) {
      return systemError('Duplicate barcode in BakeryOS catalog');
    }

    const codeMatches = catalog.byCode.get(codeKey) ?? [];

    if (codeMatches.length === 1) {
      const codeProduct = codeMatches[0]!;

      if (name) {
        const nameCodeConflict = detectNameCodeConflict(name, codeProduct, catalog, fuzzyMin);

        if (nameCodeConflict) {
          return nameCodeConflict;
        }
      }

      return matchedResult(codeProduct, {
        confidence: PRODUCT_MATCH_CONFIDENCE.BARCODE,
        reason: 'Barcode Match',
        importUnit,
      });
    }
  }

  if (name) {
    const normalizedName = normalizeProductMatchName(name);

    if (normalizedName) {
      const savedProductId = options.savedMappings?.get(normalizedName);

      if (savedProductId) {
        const savedProduct = catalog.products.find((entry) => entry.id === savedProductId);

        if (savedProduct && !isDeleted(savedProduct)) {
          return matchedResult(savedProduct, {
            confidence: PRODUCT_MATCH_CONFIDENCE.SAVED_MAPPING,
            reason: 'Saved Mapping',
            importUnit,
          });
        }
      }

      if (catalog.duplicateExactNames.has(normalizedName)) {
        return systemError('Multiple active products share the same name in BakeryOS');
      }

      const exactMatches = catalog.byExactName.get(normalizedName) ?? [];

      if (exactMatches.length === 1) {
        const product = exactMatches[0]!;

        if (!product.isActive) {
          return needsConfirmationResult(product, {
            confidence: PRODUCT_MATCH_CONFIDENCE.EXACT_NAME,
            reason: 'Inactive Product',
            importUnit,
          });
        }

        return matchedResult(product, {
          confidence: PRODUCT_MATCH_CONFIDENCE.EXACT_NAME,
          reason: 'Exact Name Match',
          importUnit,
        });
      }

      const fuzzyCandidates = scoreFuzzyCandidates(name, catalog.products, fuzzyMin);

      if (fuzzyCandidates.length >= 2) {
        const topScore = fuzzyCandidates[0]!.confidence;
        const tied = fuzzyCandidates.filter(
          (candidate) => topScore - candidate.confidence <= FUZZY_TIE_BAND,
        );

        if (tied.length >= 2 || isGenericNameMatch(normalizedName, tied)) {
          return multipleMatchesResult(tied, 'Multiple similar products');
        }

        const clearWinner = fuzzyCandidates[0]!;
        const winnerProduct = catalog.products.find((entry) => entry.id === clearWinner.productId);

        if (winnerProduct) {
          if (!winnerProduct.isActive) {
            return needsConfirmationResult(winnerProduct, {
              confidence: clearWinner.confidence,
              reason: 'Inactive Product',
              importUnit,
            });
          }

          return needsConfirmationResult(winnerProduct, {
            confidence: clearWinner.confidence,
            reason: 'Fuzzy Name Match',
            importUnit,
          });
        }
      }

      if (fuzzyCandidates.length === 1) {
        const candidate = fuzzyCandidates[0]!;
        const product = catalog.products.find((entry) => entry.id === candidate.productId);

        if (product) {
          if (!product.isActive) {
            return needsConfirmationResult(product, {
              confidence: candidate.confidence,
              reason: 'Inactive Product',
              importUnit,
            });
          }

          return needsConfirmationResult(product, {
            confidence: candidate.confidence,
            reason: 'Fuzzy Name Match',
            importUnit,
          });
        }
      }
    }
  }

  return notFound('No matching product in BakeryOS catalog');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreFuzzyCandidates(
  importName: string,
  products: readonly ProductMatchCatalogEntry[],
  fuzzyMin: number,
): ProductMatchCandidate[] {
  const scored = products
    .map((product) => ({
      productId: product.id,
      productName: product.name,
      confidence: scoreProductNameSimilarity(importName, product.name),
    }))
    .filter(
      (candidate) =>
        candidate.confidence >= fuzzyMin &&
        candidate.confidence <= PRODUCT_MATCH_CONFIDENCE.FUZZY_MAX,
    )
    .sort((a, b) => b.confidence - a.confidence);

  return scored;
}

function detectNameCodeConflict(
  name: string,
  codeProduct: ProductMatchCatalogEntry,
  catalog: ProductMatchCatalog,
  fuzzyMin: number,
): ProductMatchResult | null {
  const normalizedName = normalizeProductMatchName(name);
  const normalizedCodeName = normalizeProductMatchName(codeProduct.name);

  if (normalizedName === normalizedCodeName) {
    return null;
  }

  if (catalog.duplicateExactNames.has(normalizedName)) {
    return systemError('Multiple active products share the same name in BakeryOS');
  }

  const candidates: ProductMatchCandidate[] = [
    {
      productId: codeProduct.id,
      productName: codeProduct.name,
      confidence: PRODUCT_MATCH_CONFIDENCE.BARCODE,
    },
  ];

  const exactMatches = catalog.byExactName.get(normalizedName) ?? [];

  if (exactMatches.length === 1 && exactMatches[0]!.id !== codeProduct.id) {
    candidates.push({
      productId: exactMatches[0]!.id,
      productName: exactMatches[0]!.name,
      confidence: PRODUCT_MATCH_CONFIDENCE.EXACT_NAME,
    });

    return multipleMatchesResult(
      candidates,
      'Product name and product code refer to different products',
    );
  }

  const nameScoreForCodeProduct = scoreProductNameSimilarity(name, codeProduct.name);
  const fuzzyCandidates = scoreFuzzyCandidates(name, catalog.products, fuzzyMin).filter(
    (candidate) => candidate.productId !== codeProduct.id,
  );

  if (fuzzyCandidates.length === 0) {
    return null;
  }

  const topScore = fuzzyCandidates[0]!.confidence;

  if (topScore <= nameScoreForCodeProduct) {
    return null;
  }

  const tied = fuzzyCandidates.filter(
    (candidate) => topScore - candidate.confidence <= FUZZY_TIE_BAND,
  );

  for (const candidate of tied) {
    if (!candidates.some((entry) => entry.productId === candidate.productId)) {
      candidates.push(candidate);
    }
  }

  if (candidates.length >= 2) {
    return multipleMatchesResult(
      candidates,
      'Product name and product code refer to different products',
    );
  }

  return null;
}

function multipleMatchesResult(
  candidates: readonly ProductMatchCandidate[],
  reason: string,
): ProductMatchResult {
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const topScore = sorted[0]?.confidence ?? PRODUCT_MATCH_CONFIDENCE.NOT_FOUND;

  return {
    status: PRODUCT_MATCH_STATUS.MULTIPLE_MATCHES,
    matchedProductId: null,
    matchedProductName: null,
    confidence: clampConfidence(topScore),
    reason,
    candidates: sorted,
  };
}

function isGenericNameMatch(
  normalizedImportName: string,
  candidates: readonly ProductMatchCandidate[],
): boolean {
  const importTokens = normalizedImportName.split(' ').filter(Boolean);

  if (importTokens.length !== 1) {
    return false;
  }

  const token = importTokens[0]!;
  let hits = 0;

  for (const candidate of candidates) {
    const catalogNorm = normalizeProductMatchName(candidate.productName);

    if (catalogNorm.includes(token)) {
      hits += 1;
    }
  }

  return hits >= 2;
}

function buildUnitWarnings(
  importUnit: string | null,
  product: ProductMatchCatalogEntry,
): ProductMatchWarning[] | undefined {
  if (!importUnit || !product.unit) {
    return undefined;
  }

  if (normalizeUnit(importUnit) === normalizeUnit(product.unit)) {
    return undefined;
  }

  return [
    {
      code: 'UNIT_MISMATCH',
      message: `Import unit "${importUnit}" differs from catalog unit "${product.unit}"`,
      importUnit,
      catalogUnit: product.unit,
    },
  ];
}

function matchedResult(
  product: ProductMatchCatalogEntry,
  params: { confidence: number; reason: string; importUnit: string | null },
): ProductMatchResult {
  const warnings = buildUnitWarnings(params.importUnit, product);

  return {
    status: PRODUCT_MATCH_STATUS.MATCHED,
    matchedProductId: product.id,
    matchedProductName: product.name,
    confidence: clampConfidence(params.confidence),
    reason: params.reason,
    ...(warnings ? { warnings } : {}),
  };
}

function needsConfirmationResult(
  product: ProductMatchCatalogEntry,
  params: { confidence: number; reason: string; importUnit: string | null },
): ProductMatchResult {
  const warnings = buildUnitWarnings(params.importUnit, product);

  return {
    status: PRODUCT_MATCH_STATUS.NEEDS_CONFIRMATION,
    matchedProductId: product.id,
    matchedProductName: product.name,
    confidence: clampConfidence(params.confidence),
    reason: params.reason,
    ...(warnings ? { warnings } : {}),
  };
}

function notFound(reason: string): ProductMatchResult {
  return {
    status: PRODUCT_MATCH_STATUS.NOT_FOUND,
    matchedProductId: null,
    matchedProductName: null,
    confidence: PRODUCT_MATCH_CONFIDENCE.NOT_FOUND,
    reason,
  };
}

function systemError(reason: string): ProductMatchResult {
  return {
    status: PRODUCT_MATCH_STATUS.SYSTEM_CONFIGURATION_ERROR,
    matchedProductId: null,
    matchedProductName: null,
    confidence: PRODUCT_MATCH_CONFIDENCE.NOT_FOUND,
    reason,
  };
}

function clampConfidence(value: number): number {
  if (value < 0) {
    return 0;
  }

  if (value > 100) {
    return 100;
  }

  return Math.round(value);
}
