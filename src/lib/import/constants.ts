/** Upload limits and accepted formats for the import wizard. */

export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export const IMPORT_FILE_EXTENSIONS = ['csv', 'xlsx', 'xls'] as const;

/** Value for the file input's `accept` attribute. */
export const IMPORT_FILE_ACCEPT = IMPORT_FILE_EXTENSIONS.map((ext) => `.${ext}`).join(',');

export function isSupportedImportFileName(fileName: string): boolean {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';

  return (IMPORT_FILE_EXTENSIONS as readonly string[]).includes(extension);
}
