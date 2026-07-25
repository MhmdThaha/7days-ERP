import type { ImportEntityType } from '@/lib/import/definitions';

type ImportUiCopy = {
  checkingConflictsDescription: (fileName: string) => string;
  committingTitle: string;
  committingDescription: string;
  previewConflictHint: string;
  importNewOnlyLabel: string;
  updateExistingLabel: string | null;
};

export const IMPORT_UI_COPY: Partial<Record<ImportEntityType, ImportUiCopy>> = {
  product: {
    checkingConflictsDescription: (fileName) =>
      `Comparing ${fileName} with products already in BakeryOS.`,
    committingTitle: 'Importing products…',
    committingDescription: 'Saving products to BakeryOS. Please wait…',
    previewConflictHint: 'will be checked for duplicates and existing products before import.',
    importNewOnlyLabel: 'Import New Products Only',
    updateExistingLabel: 'Update Existing Products',
  },
  sale: {
    checkingConflictsDescription: (fileName) =>
      `Comparing ${fileName} with sales already in BakeryOS.`,
    committingTitle: 'Importing sales…',
    committingDescription: 'Saving sales and updating inventory. Please wait…',
    previewConflictHint: 'will be grouped, matched to products, and checked against existing sales before import.',
    importNewOnlyLabel: 'Import Sales',
    updateExistingLabel: null,
  },
};

export function getImportUiCopy(entityType: ImportEntityType): ImportUiCopy {
  return (
    IMPORT_UI_COPY[entityType] ?? {
      checkingConflictsDescription: (fileName) => `Checking ${fileName} for conflicts.`,
      committingTitle: 'Importing…',
      committingDescription: 'Saving to BakeryOS. Please wait…',
      previewConflictHint: 'will be checked for conflicts before import.',
      importNewOnlyLabel: 'Import',
      updateExistingLabel: null,
    }
  );
}
