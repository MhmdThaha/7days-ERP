/**
 * Client-safe import outcome types and structural type guards.
 *
 * Kept separate from import-entity-handlers.ts so Client Components can
 * discriminate product vs sale conflict payloads without pulling in the
 * server-only handler registry (Firestore, repositories, commit services).
 */

import type { CommitResult } from '@/lib/import/services/commit.service';
import type { ConflictDetectionResult } from '@/lib/import/services/conflict.service';
import type { ResolvedCommitResult } from '@/lib/import/services/conflict-resolution.service';
import type { SaleImportCommitResult } from '@/lib/import/services/sale-import-commit.service';
import type { SaleConflictDetectionResult } from '@/lib/import/services/sale-conflict.service';

export type ImportConflictDetectionOutcome =
  | ConflictDetectionResult
  | SaleConflictDetectionResult;

export type ImportCommitOutcomeResult =
  | CommitResult
  | ResolvedCommitResult
  | SaleImportCommitResult;

export function isProductConflictDetectionResult(
  conflicts: ImportConflictDetectionOutcome,
): conflicts is ConflictDetectionResult {
  return 'duplicateRowsInFile' in conflicts;
}

export function isSaleConflictDetectionResult(
  conflicts: ImportConflictDetectionOutcome,
): conflicts is SaleConflictDetectionResult {
  return 'cleanGroups' in conflicts;
}
