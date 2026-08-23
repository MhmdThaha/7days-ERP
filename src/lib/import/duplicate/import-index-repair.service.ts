import 'server-only';

import { isBlockingImportHistoryStatus } from '@/lib/import/duplicate';
import {
  IMPORT_DUPLICATE_INDEX_STATUS,
  ORG_IMPORT_INDEX_COVERAGE,
} from '@/lib/import/duplicate/import-index-health.types';
import { verifyImportDuplicateIndexHits } from '@/lib/import/duplicate/import-index-verification';
import { importDuplicateIndexRepository } from '@/lib/repositories/import-duplicate-index.repository';
import { importHistoryRepository } from '@/lib/repositories/import-history.repository';
import { importIndexHealthRepository } from '@/lib/repositories/import-index-health.repository';
import { scheduleAfterResponse } from '@/lib/server/schedule-after-response';

const repairInFlightByOrg = new Set<string>();

export type ImportIndexRepairResult = {
  coverage: typeof ORG_IMPORT_INDEX_COVERAGE[keyof typeof ORG_IMPORT_INDEX_COVERAGE];
  repairedImportCount: number;
  verifiedCompleteCount: number;
  stillIncompleteCount: number;
};

async function recomputeAndPersistOrgCoverage(orgId: string, userId: string): Promise<ImportIndexRepairResult> {
  const records = await importHistoryRepository.list(orgId);
  const blocking = records.filter((record) => isBlockingImportHistoryStatus(record.status));
  const incomplete = blocking.filter(
    (record) => record.duplicateIndexStatus !== IMPORT_DUPLICATE_INDEX_STATUS.COMPLETE,
  );

  const coverage =
    blocking.length > 0 && incomplete.length === 0
      ? ORG_IMPORT_INDEX_COVERAGE.COMPLETE
      : ORG_IMPORT_INDEX_COVERAGE.INCOMPLETE;

  await importIndexHealthRepository.setOrgCoverage(orgId, userId, {
    coverage,
    blockingImportCount: blocking.length,
    incompleteImportCount: incomplete.length,
    lastRepairCompletedAt: new Date(),
    lastRepairError: null,
  });

  return {
    coverage,
    repairedImportCount: 0,
    verifiedCompleteCount: blocking.length - incomplete.length,
    stillIncompleteCount: incomplete.length,
  };
}

export const importIndexRepairService = {
  scheduleRepair(orgId: string, userId: string): void {
    if (repairInFlightByOrg.has(orgId)) {
      return;
    }

    const scheduled = scheduleAfterResponse(async () => {
      repairInFlightByOrg.add(orgId);

      try {
        await importIndexRepairService.repairOrganizationIndex(orgId, userId);
      } finally {
        repairInFlightByOrg.delete(orgId);
      }
    });

    if (!scheduled) {
      repairInFlightByOrg.add(orgId);
      void importIndexRepairService.repairOrganizationIndex(orgId, userId).finally(() => {
        repairInFlightByOrg.delete(orgId);
      });
    }
  },

  async repairOrganizationIndex(orgId: string, userId: string): Promise<ImportIndexRepairResult> {
    await importIndexHealthRepository.setOrgCoverage(orgId, userId, {
      coverage: ORG_IMPORT_INDEX_COVERAGE.REPAIRING,
      lastRepairStartedAt: new Date(),
      lastRepairError: null,
    });

    try {
      const records = await importHistoryRepository.list(orgId);
      const blocking = records.filter((record) => isBlockingImportHistoryStatus(record.status));
      let repairedImportCount = 0;

      for (const record of blocking) {
        if (record.duplicateMetadataComplete === false) {
          await importIndexHealthRepository.setImportDuplicateIndexStatus(
            orgId,
            record.importId,
            userId,
            IMPORT_DUPLICATE_INDEX_STATUS.FAILED,
          );
          continue;
        }

        if (record.duplicateIndexStatus === IMPORT_DUPLICATE_INDEX_STATUS.COMPLETE) {
          const stillVerified = await verifyImportDuplicateIndexHits(
            orgId,
            record.importId,
            record.invoiceNumbers,
            record.rowFingerprints,
          );

          if (stillVerified) {
            continue;
          }
        }

        const indexResult = await importDuplicateIndexRepository.indexImportDuplicateHits(
          orgId,
          userId,
          {
            importId: record.importId,
            invoiceNumbers: record.invoiceNumbers,
            rowFingerprints: record.rowFingerprints,
            status: record.status,
          },
        );

        if (!indexResult.success) {
          await importIndexHealthRepository.setImportDuplicateIndexStatus(
            orgId,
            record.importId,
            userId,
            IMPORT_DUPLICATE_INDEX_STATUS.FAILED,
          );
          continue;
        }

        const verified = await verifyImportDuplicateIndexHits(
          orgId,
          record.importId,
          record.invoiceNumbers,
          record.rowFingerprints,
        );

        await importIndexHealthRepository.setImportDuplicateIndexStatus(
          orgId,
          record.importId,
          userId,
          verified ? IMPORT_DUPLICATE_INDEX_STATUS.COMPLETE : IMPORT_DUPLICATE_INDEX_STATUS.FAILED,
        );

        if (verified) {
          repairedImportCount += 1;
        }
      }

      const summary = await recomputeAndPersistOrgCoverage(orgId, userId);

      return {
        ...summary,
        repairedImportCount,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import index repair failed.';

      await importIndexHealthRepository.setOrgCoverage(orgId, userId, {
        coverage: ORG_IMPORT_INDEX_COVERAGE.INCOMPLETE,
        lastRepairError: message,
      });

      throw error;
    }
  },
};

async function runImportDuplicateIndexPersistence(
  orgId: string,
  userId: string,
  importId: string,
): Promise<void> {
  const record = await importHistoryRepository.getById(orgId, importId);

  if (!record) {
    return;
  }

  if (record.duplicateMetadataComplete === false) {
    await importIndexHealthRepository.setImportDuplicateIndexStatus(
      orgId,
      importId,
      userId,
      IMPORT_DUPLICATE_INDEX_STATUS.FAILED,
    );
    await importIndexHealthRepository.setOrgCoverage(orgId, userId, {
      coverage: ORG_IMPORT_INDEX_COVERAGE.INCOMPLETE,
    });
    importIndexRepairService.scheduleRepair(orgId, userId);
    return;
  }

  const indexResult = await importDuplicateIndexRepository.indexImportDuplicateHits(orgId, userId, {
    importId,
    invoiceNumbers: record.invoiceNumbers,
    rowFingerprints: record.rowFingerprints,
    status: record.status,
  });

  await importIndexHealthService.recordImportIndexWrite({
    orgId,
    userId,
    importId,
    invoiceNumbers: record.invoiceNumbers,
    rowFingerprints: record.rowFingerprints,
    indexWriteSucceeded: indexResult.success,
  });
}

export const importIndexHealthService = {
  async recordImportIndexWrite(input: {
    orgId: string;
    userId: string;
    importId: string;
    invoiceNumbers: readonly string[];
    rowFingerprints: readonly string[];
    indexWriteSucceeded: boolean;
  }): Promise<void> {
    if (!input.indexWriteSucceeded) {
      await importIndexHealthRepository.setImportDuplicateIndexStatus(
        input.orgId,
        input.importId,
        input.userId,
        IMPORT_DUPLICATE_INDEX_STATUS.FAILED,
      );
      await importIndexHealthRepository.setOrgCoverage(input.orgId, input.userId, {
        coverage: ORG_IMPORT_INDEX_COVERAGE.INCOMPLETE,
      });
      importIndexRepairService.scheduleRepair(input.orgId, input.userId);
      return;
    }

    const verified = await verifyImportDuplicateIndexHits(
      input.orgId,
      input.importId,
      input.invoiceNumbers,
      input.rowFingerprints,
    );

    await importIndexHealthRepository.setImportDuplicateIndexStatus(
      input.orgId,
      input.importId,
      input.userId,
      verified ? IMPORT_DUPLICATE_INDEX_STATUS.COMPLETE : IMPORT_DUPLICATE_INDEX_STATUS.FAILED,
    );

    if (!verified) {
      await importIndexHealthRepository.setOrgCoverage(input.orgId, input.userId, {
        coverage: ORG_IMPORT_INDEX_COVERAGE.INCOMPLETE,
      });
      importIndexRepairService.scheduleRepair(input.orgId, input.userId);
      return;
    }

    await recomputeAndPersistOrgCoverage(input.orgId, input.userId);
  },

  /**
   * Writes duplicate-index hits and health status after the import response returns.
   * Uses Next.js `after()` when available; falls back to the same repair path used elsewhere.
   */
  scheduleDeferredImportDuplicateIndexWrite(input: {
    orgId: string;
    userId: string;
    importId: string;
  }): void {
    const task = async () => {
      try {
        await runImportDuplicateIndexPersistence(input.orgId, input.userId, input.importId);
      } catch (error) {
        console.error('[import-index-deferred] failed to persist duplicate index', {
          orgId: input.orgId,
          importId: input.importId,
          error,
        });
        importIndexRepairService.scheduleRepair(input.orgId, input.userId);
      }
    };

    const scheduled = scheduleAfterResponse(task);

    if (!scheduled) {
      void task().catch((error) => {
        console.error('[import-index-deferred] fallback task failed', {
          orgId: input.orgId,
          importId: input.importId,
          error,
        });
        importIndexRepairService.scheduleRepair(input.orgId, input.userId);
      });
    }
  },

  /** Test helper: run deferred index persistence synchronously. */
  async persistImportDuplicateIndexForImport(
    orgId: string,
    userId: string,
    importId: string,
  ): Promise<void> {
    await runImportDuplicateIndexPersistence(orgId, userId, importId);
  },

  /** Test/dev helper: verify all blocking imports and mark org complete when healthy. */
  async verifyAndMarkOrgComplete(orgId: string, userId: string): Promise<ImportIndexRepairResult> {
    return importIndexRepairService.repairOrganizationIndex(orgId, userId);
  },
};
