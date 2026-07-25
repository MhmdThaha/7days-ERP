/**
 * Public barrel for Saved Mapping types + pure apply helpers.
 * Repository stays server-only and is imported from repositories/.
 */

export {
  SAVED_MAPPING_SCHEMA_VERSION,
  type AppliedMappingEntry,
  type OutdatedMappingEntry,
  type SavedColumnMapping,
  type SavedMappingDocument,
  type SavedMappingResult,
  type SkippedMappingEntry,
} from '@/lib/import/saved-mapping/types';
export {
  applySavedMapping,
  buildSavedMappingDocument,
  savedMappingDocId,
  type ApplySavedMappingInput,
  type ResolveImportMappingResult,
} from '@/lib/import/services/saved-mapping.service';
