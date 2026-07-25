/**
 * Import entity handlers — registry-backed dispatch for conflict detection
 * and commit. Each importable entity registers handlers here; actions stay
 * thin and delegate without long if/else chains.
 *
 * To add Raw Material, Supplier, Recipe, or Customer later: register one
 * conflict handler and one commit handler — no action changes required.
 *
 * Server-only: Client Components must import types/guards from
 * import-entity-outcomes.ts instead of this module.
 */

import 'server-only';

import type { Firestore } from 'firebase-admin/firestore';

import { DomainError } from '@/lib/domain/errors';
import type { ImportEntityType } from '@/lib/import/definitions';
import { commitProductImport } from '@/lib/import/services/commit.service';
import {
  commitProductImportWithResolution,
  type ImportResolutionStrategy,
} from '@/lib/import/services/conflict-resolution.service';
import { detectProductImportConflictsForOrg } from '@/lib/import/services/conflict.service';
import type {
  ImportCommitOutcomeResult,
  ImportConflictDetectionOutcome,
} from '@/lib/import/services/import-entity-outcomes';
import {
  isProductConflictDetectionResult,
  isSaleConflictDetectionResult,
} from '@/lib/import/services/import-entity-outcomes';
import type { ImportRunReport } from '@/lib/import/services/import.service';
import { commitSaleImport, type SaleImportCommitResult } from '@/lib/import/services/sale-import-commit.service';
import {
  detectSaleImportConflictsForOrg,
  type SaleConflictDetectionResult,
} from '@/lib/import/services/sale-conflict.service';
import { groupSaleImportRows } from '@/lib/import/services/sale-import-grouping.service';
import { resolveSaleImportProductsForOrg } from '@/lib/import/services/sale-import-product-resolver';

export type {
  ImportCommitOutcomeResult,
  ImportConflictDetectionOutcome,
} from '@/lib/import/services/import-entity-outcomes';
export {
  isProductConflictDetectionResult,
  isSaleConflictDetectionResult,
} from '@/lib/import/services/import-entity-outcomes';

export type ImportEntityContext = {
  db: Firestore;
  orgId: string;
  userId: string;
};

export type ImportConflictHandler = (
  report: ImportRunReport,
  context: Pick<ImportEntityContext, 'db' | 'orgId'>,
) => Promise<ImportConflictDetectionOutcome>;

export type ImportCommitHandler = (
  report: ImportRunReport,
  conflicts: ImportConflictDetectionOutcome,
  strategy: ImportResolutionStrategy,
  context: ImportEntityContext,
) => Promise<ImportCommitOutcomeResult>;

export type ImportLegacyCommitHandler = (
  report: ImportRunReport,
  context: ImportEntityContext,
) => Promise<ImportCommitOutcomeResult>;

function assertConflictResultMatchesEntity(
  entityType: ImportEntityType,
  conflicts: ImportConflictDetectionOutcome,
): void {
  if (entityType === 'product' && !isProductConflictDetectionResult(conflicts)) {
    throw new DomainError('VALIDATION_ERROR', 'Product conflict results are required.');
  }

  if (entityType === 'sale' && !isSaleConflictDetectionResult(conflicts)) {
    throw new DomainError('VALIDATION_ERROR', 'Sale conflict results are required.');
  }
}

async function detectSaleImportConflictsFromReport(
  report: ImportRunReport,
  context: Pick<ImportEntityContext, 'db' | 'orgId'>,
): Promise<SaleConflictDetectionResult> {
  const groups = groupSaleImportRows(report.result.rows);
  const resolvedGroups = await resolveSaleImportProductsForOrg(
    groups,
    context.db,
    context.orgId,
  );

  return detectSaleImportConflictsForOrg(resolvedGroups, context.db, context.orgId);
}

async function commitSaleImportFromConflicts(
  conflicts: SaleConflictDetectionResult,
  context: Pick<ImportEntityContext, 'orgId' | 'userId'>,
  strategy: ImportResolutionStrategy,
): Promise<SaleImportCommitResult> {
  if (strategy !== 'new-only') {
    throw new DomainError(
      'VALIDATION_ERROR',
      'Sales import only supports importing new sales.',
    );
  }

  return commitSaleImport(conflicts.cleanGroups, {
    orgId: context.orgId,
    userId: context.userId,
  });
}

const IMPORT_CONFLICT_HANDLERS: Partial<Record<ImportEntityType, ImportConflictHandler>> = {
  product: (report, context) =>
    detectProductImportConflictsForOrg(report, context.db, context.orgId),
  sale: detectSaleImportConflictsFromReport,
};

const IMPORT_COMMIT_HANDLERS: Partial<Record<ImportEntityType, ImportCommitHandler>> = {
  product: (report, conflicts, strategy, context) => {
    if (!isProductConflictDetectionResult(conflicts)) {
      throw new DomainError('VALIDATION_ERROR', 'Product conflict results are required.');
    }

    return commitProductImportWithResolution(
      context.db,
      report,
      conflicts,
      strategy,
      { orgId: context.orgId, userId: context.userId },
    );
  },
  sale: async (_report, conflicts, strategy, context) => {
    if (!isSaleConflictDetectionResult(conflicts)) {
      throw new DomainError('VALIDATION_ERROR', 'Sale conflict results are required.');
    }

    return commitSaleImportFromConflicts(conflicts, context, strategy);
  },
};

const IMPORT_LEGACY_COMMIT_HANDLERS: Partial<
  Record<ImportEntityType, ImportLegacyCommitHandler>
> = {
  product: (report, context) =>
    commitProductImport(context.db, report, {
      orgId: context.orgId,
      userId: context.userId,
    }),
  sale: async (report, context) => {
    const conflicts = await detectSaleImportConflictsFromReport(report, context);

    return commitSaleImportFromConflicts(conflicts, context, 'new-only');
  },
};

export function getImportConflictHandler(
  entityType: ImportEntityType,
): ImportConflictHandler | undefined {
  return IMPORT_CONFLICT_HANDLERS[entityType];
}

export function getImportCommitHandler(
  entityType: ImportEntityType,
): ImportCommitHandler | undefined {
  return IMPORT_COMMIT_HANDLERS[entityType];
}

export function getImportLegacyCommitHandler(
  entityType: ImportEntityType,
): ImportLegacyCommitHandler | undefined {
  return IMPORT_LEGACY_COMMIT_HANDLERS[entityType];
}

export function assertImportConflictSupported(entityType: ImportEntityType): ImportConflictHandler {
  const handler = getImportConflictHandler(entityType);

  if (!handler) {
    throw new DomainError(
      'VALIDATION_ERROR',
      `Conflict detection for "${entityType}" is not supported yet.`,
    );
  }

  return handler;
}

export function assertImportCommitSupported(entityType: ImportEntityType): ImportCommitHandler {
  const handler = getImportCommitHandler(entityType);

  if (!handler) {
    throw new DomainError(
      'VALIDATION_ERROR',
      `Importing "${entityType}" is not supported yet.`,
    );
  }

  return handler;
}

export function assertImportLegacyCommitSupported(
  entityType: ImportEntityType,
): ImportLegacyCommitHandler {
  const handler = getImportLegacyCommitHandler(entityType);

  if (!handler) {
    throw new DomainError(
      'VALIDATION_ERROR',
      `Importing "${entityType}" is not supported yet.`,
    );
  }

  return handler;
}
