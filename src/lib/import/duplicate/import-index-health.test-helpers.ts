import {
  IMPORT_DUPLICATE_INDEX_STATUS,
  ORG_IMPORT_INDEX_COVERAGE,
} from '@/lib/import/duplicate/import-index-health.types';
import { isBlockingImportHistoryStatus, type ImportHistoryRecord } from '@/lib/import/duplicate';
import { importIndexHealthRepository } from '@/lib/repositories/import-index-health.repository';

export async function markOrgIndexCoverageCompleteForTests(
  orgId: string,
  userId: string,
  blockingImportCount = 0,
): Promise<void> {
  await importIndexHealthRepository.setOrgCoverage(orgId, userId, {
    coverage: ORG_IMPORT_INDEX_COVERAGE.COMPLETE,
    blockingImportCount,
    incompleteImportCount: 0,
  });
}

export async function markImportIndexCompleteForTests(
  orgId: string,
  userId: string,
  importId: string,
): Promise<void> {
  await importIndexHealthRepository.setImportDuplicateIndexStatus(
    orgId,
    importId,
    userId,
    IMPORT_DUPLICATE_INDEX_STATUS.COMPLETE,
  );
}

/** After indexing all blocking history in tests, mark org safe for fast-path duplicate lookup. */
export async function finalizeIndexedHistoryForTests(
  orgId: string,
  userId: string,
  records: readonly ImportHistoryRecord[],
): Promise<void> {
  const blocking = records.filter((record) => isBlockingImportHistoryStatus(record.status));

  for (const record of blocking) {
    await markImportIndexCompleteForTests(orgId, userId, record.importId);
  }

  await markOrgIndexCoverageCompleteForTests(orgId, userId, blocking.length);
}

export async function markOrgIndexCoverageIncompleteForTests(
  orgId: string,
  userId: string,
): Promise<void> {
  await importIndexHealthRepository.setOrgCoverage(orgId, userId, {
    coverage: ORG_IMPORT_INDEX_COVERAGE.INCOMPLETE,
  });
}
