/**
 * Sale Import Commit.
 *
 * Takes conflict-free import groups and writes completed sales to Firestore.
 *
 * Pipeline per group:
 *   clean group → CreateSaleInput DTO → saleService.create → saleService.complete
 *
 * Completing the sale updates inventory (same path as manual sale completion).
 * One failed group never crashes the run — remaining groups still commit.
 */

import 'server-only';

import { DomainError } from '@/lib/domain/errors';
import type { NormalizedValue } from '@/lib/import/engine/types';
import { normalizeSaleDateValue } from '@/lib/import/services/sale-import-grouping.service';
import type { ResolvedSaleImportGroup } from '@/lib/import/services/sale-import-product-resolver';
import { productRepository } from '@/lib/repositories/product.repository';
import { saleService } from '@/lib/services/sale.service';
import type { CreateSaleInput, Sale, SaleLineItemInput } from '@/types/sale';

export type SaleImportCommitOptions = {
  orgId: string;
  userId: string;
};

export type SaleImportGroupCommitStatus = 'imported' | 'skipped' | 'failed';

export type SaleImportGroupCommitResult = {
  groupKey: string;
  rowNumbers: readonly number[];
  status: SaleImportGroupCommitStatus;
  saleId?: string;
  saleNumber?: string;
  reason?: string;
};

export type SaleImportCommitError = {
  groupKey: string;
  rowNumbers: readonly number[];
  message: string;
};

export type SaleImportCommitResult = {
  importedCount: number;
  skippedCount: number;
  failedCount: number;
  saleIds: readonly string[];
  saleNumbers: readonly string[];
  groupResults: readonly SaleImportGroupCommitResult[];
  commitErrors: readonly SaleImportCommitError[];
};

/** DTO passed to saleService.create, including optional imported sale number. */
export type SaleImportCreateInput = CreateSaleInput & {
  saleNumber?: string;
};

export type SaleImportBuildError = {
  code: 'NO_IMPORTABLE_LINES' | 'UNRESOLVED_PRODUCT' | 'DUPLICATE_PRODUCT' | 'INVALID_QUANTITY';
  message: string;
};

function readTrimmedString(value: NormalizedValue | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}

function readSaleDate(group: ResolvedSaleImportGroup): string | null {
  const normalized = normalizeSaleDateValue(group.header.saleDate);

  if (normalized) {
    return normalized;
  }

  return readTrimmedString(group.header.saleDate);
}

/**
 * Converts import-engine money (major units) to sale line minor units (paise).
 * Sale forms and saleService use the same integer paise convention as products.
 */
export function importMoneyToSaleMinorUnits(majorUnits: number): number {
  return Math.round(majorUnits * 100);
}

function readImportedSellingPriceMinor(
  value: NormalizedValue | undefined,
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return importMoneyToSaleMinorUnits(value);
}

function readQuantity(value: NormalizedValue | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
}

function importableLines(group: ResolvedSaleImportGroup) {
  return group.lines.filter((line) => line.status !== 'error' && line.resolvedProduct !== null);
}

/**
 * Builds a CreateSaleInput DTO from one clean import group.
 * Returns a structured error when the group cannot be committed as-is.
 */
export function buildSaleImportCreateInput(
  group: ResolvedSaleImportGroup,
): SaleImportCreateInput | SaleImportBuildError {
  const lines = importableLines(group);

  if (lines.length === 0) {
    return {
      code: 'NO_IMPORTABLE_LINES',
      message: 'Sale has no importable product lines.',
    };
  }

  const saleDate = readSaleDate(group);

  if (!saleDate) {
    return {
      code: 'NO_IMPORTABLE_LINES',
      message: 'Sale Date is required.',
    };
  }

  const saleLines: SaleLineItemInput[] = [];
  const seenProductIds = new Set<string>();

  for (const line of lines) {
    const productId = line.resolvedProduct!.id;

    if (seenProductIds.has(productId)) {
      return {
        code: 'DUPLICATE_PRODUCT',
        message: `Product "${line.resolvedProduct!.name}" appears on more than one line.`,
      };
    }

    seenProductIds.add(productId);

    const quantity = readQuantity(line.values['quantity']);

    if (quantity === null) {
      return {
        code: 'INVALID_QUANTITY',
        message: `Invalid quantity on row ${line.rowNumber}.`,
      };
    }

    const importedPriceMinor = readImportedSellingPriceMinor(line.values['sellingPrice']);

    saleLines.push({
      productId,
      quantity,
      sellingPrice: importedPriceMinor ?? 0,
    });
  }

  const customerName = readTrimmedString(group.header.customerName);
  const notes = readTrimmedString(group.header.notes);
  const saleNumber = group.header.saleNumber?.trim();

  return {
    saleDate,
    customerName,
    notes,
    lines: saleLines,
    ...(saleNumber ? { saleNumber } : {}),
  };
}

async function resolveMissingSellingPrices(
  orgId: string,
  input: SaleImportCreateInput,
): Promise<SaleImportCreateInput> {
  const lines = await Promise.all(
    input.lines.map(async (line) => {
      if (line.sellingPrice > 0) {
        return line;
      }

      const product = await productRepository.getById(orgId, line.productId);

      if (!product) {
        throw new DomainError('NOT_FOUND', 'One or more products were not found');
      }

      return {
        ...line,
        sellingPrice: product.sellingPrice,
      };
    }),
  );

  return {
    ...input,
    lines,
  };
}

function domainErrorMessage(error: unknown): string {
  if (error instanceof DomainError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

/**
 * Commits clean sale import groups as completed BakeryOS sales.
 * Each successful group creates a draft sale, then completes it to update inventory.
 */
export async function commitSaleImport(
  cleanGroups: readonly ResolvedSaleImportGroup[],
  options: SaleImportCommitOptions,
): Promise<SaleImportCommitResult> {
  const groupResults: SaleImportGroupCommitResult[] = [];
  const commitErrors: SaleImportCommitError[] = [];
  const saleIds: string[] = [];
  const saleNumbers: string[] = [];

  for (const group of cleanGroups) {
    const built = buildSaleImportCreateInput(group);

    if ('code' in built) {
      groupResults.push({
        groupKey: group.groupKey,
        rowNumbers: group.rowNumbers,
        status: 'skipped',
        reason: built.message,
      });
      continue;
    }

    try {
      const input = await resolveMissingSellingPrices(options.orgId, built);
      const draft = await saleService.create(options.orgId, input, options.userId);
      const completed: Sale = await saleService.complete(options.orgId, draft.id, options.userId);

      saleIds.push(completed.id);
      saleNumbers.push(completed.saleNumber);

      groupResults.push({
        groupKey: group.groupKey,
        rowNumbers: group.rowNumbers,
        status: 'imported',
        saleId: completed.id,
        saleNumber: completed.saleNumber,
      });
    } catch (error) {
      const message = domainErrorMessage(error);

      commitErrors.push({
        groupKey: group.groupKey,
        rowNumbers: group.rowNumbers,
        message,
      });

      groupResults.push({
        groupKey: group.groupKey,
        rowNumbers: group.rowNumbers,
        status: 'failed',
        reason: message,
      });
    }
  }

  return {
    importedCount: saleIds.length,
    skippedCount: groupResults.filter((entry) => entry.status === 'skipped').length,
    failedCount: groupResults.filter((entry) => entry.status === 'failed').length,
    saleIds,
    saleNumbers,
    groupResults,
    commitErrors,
  };
}
