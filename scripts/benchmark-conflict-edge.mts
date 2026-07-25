import { detectProductImportConflicts, normalizeProductName } from '@/lib/import/services/conflict.service';
import type { ValidatedRow } from '@/lib/import/engine/types';
import type { ImportRunReport } from '@/lib/import/services/import.service';

function report(rows: ValidatedRow[]): ImportRunReport {
  return {
    entityType: 'product',
    sheetName: 'Items',
    headers: ['Name'],
    skippedEmptyRowCount: 0,
    ignoredHeaders: [],
    missingSourceHeaders: [],
    missingRequiredFields: [],
    result: {
      rows,
      summary: {
        totalRows: rows.length,
        validRows: rows.length,
        warningRows: 0,
        errorRows: 0,
      },
    },
  };
}

const conflictingRows = Array.from({ length: 1_000 }, (_, i) => ({
  rowNumber: i + 2,
  values: { name: 'Garlic Bread', sellingPrice: 40 + i },
  issues: [],
  status: 'valid' as const,
}));

let t0 = performance.now();
const conflictResult = detectProductImportConflicts(report(conflictingRows));
console.log('O(k²) edge — 1000 conflicting duplicate rows:', Math.round(performance.now() - t0), 'ms');
console.log('  Expanded conflict entries:', conflictResult.duplicateRowsInFile.length);

t0 = performance.now();
const byName = new Map<string, { id: string; name: string; code: string }>();
const byCode = new Map<string, { id: string; name: string; code: string }>();

for (let i = 0; i < 5_000; i += 1) {
  const name = `Existing Product ${i}`;
  const code = `EX-${i}`;
  byName.set(normalizeProductName(name), { id: `p${i}`, name, code });
  byCode.set(code.toUpperCase(), { id: `p${i}`, name, code });
}
console.log('Index build 5000 existing products:', Math.round(performance.now() - t0), 'ms');

const cleanRows = Array.from({ length: 1_000 }, (_, i) => ({
  rowNumber: i + 2,
  values: { name: `Product ${i + 1}`, sellingPrice: 45 },
  issues: [],
  status: 'valid' as const,
}));

t0 = performance.now();
detectProductImportConflicts(report(cleanRows), byName, byCode);
console.log('Conflict check — 1000 import rows vs 5000 existing:', Math.round(performance.now() - t0), 'ms');
