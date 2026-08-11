export {
  buildDuplicateImportFileFingerprint,
  buildDuplicateImportFingerprints,
  buildDuplicateImportRowFingerprint,
  detectDuplicateImport,
} from '@/lib/import/duplicate/duplicate-import.service';

export { planSkipDuplicates, type SkipDuplicatesPlan } from '@/lib/import/duplicate/skip-duplicates-plan';

export {
  DUPLICATE_IMPORT_RECOMMENDATION,
  DUPLICATE_IMPORT_ROW_SKIP_REASON,
  DUPLICATE_IMPORT_STATUS,
  isBlockingImportHistoryStatus,
  IMPORT_HISTORY_STATUS,
  type DetectDuplicateImportInput,
  type DuplicateImportFingerprints,
  type DuplicateImportMatchedImport,
  type DuplicateImportRecommendation,
  type DuplicateImportResult,
  type DuplicateImportStatus,
  type ImportHistoryRecord,
  type ImportHistoryStatus,
} from '@/lib/import/duplicate/duplicate-import.types';
