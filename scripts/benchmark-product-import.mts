/**
 * Product Import performance benchmark.
 *
 * Run: npx tsx scripts/benchmark-product-import.mts
 *
 * Measures engine stages, conflict detection, commit batching, preview
 * simulation, and memory for realistic product spreadsheets.
 */

import * as XLSX from 'xlsx';

import { productImportDefinition } from '@/lib/import/definitions/product.definition';
import { applyMapping } from '@/lib/import/engine/mapper';
import { normalizeRows } from '@/lib/import/engine/normalizer';
import { parseImportFile } from '@/lib/import/engine/parser';
import type { MappingConfig } from '@/lib/import/engine/types';
import { validateRows } from '@/lib/import/engine/validator';
import { commitProductImport } from '@/lib/import/services/commit.service';
import {
  detectProductImportConflicts,
  normalizeProductName,
  type ProductCodeIndex,
  type ProductNameIndex,
} from '@/lib/import/services/conflict.service';
import { runImport } from '@/lib/import/services/import.service';
import type { Firestore } from 'firebase-admin/firestore';
import type { ProductDocument } from '@/lib/repositories/product.repository';

const ROW_COUNTS = [100, 1_000, 5_000, 10_000] as const;
const EXISTING_PRODUCT_COUNT = 500;
const BATCH_SIZE = 400;
const PREVIEW_PAGE_SIZE = 50;

const PRODUCT_MAPPING: MappingConfig = {
  columnMappings: [
    { sourceHeader: 'Item Name', targetField: 'name' },
    { sourceHeader: 'Item Code', targetField: 'code' },
    { sourceHeader: 'Category', targetField: 'category' },
    { sourceHeader: 'Unit', targetField: 'unit' },
    { sourceHeader: 'Sale Price', targetField: 'sellingPrice' },
    { sourceHeader: 'Purchase Price', targetField: 'costPrice' },
    { sourceHeader: 'GST %', targetField: 'gstRate' },
    { sourceHeader: 'Stock', targetField: 'openingStock' },
    { sourceHeader: 'Min Stock', targetField: 'minimumStock' },
  ],
};

function buildProductXlsx(rowCount: number): Uint8Array {
  const rows: unknown[][] = [
    [
      'Item Name',
      'Item Code',
      'Category',
      'Unit',
      'Sale Price',
      'Purchase Price',
      'GST %',
      'Stock',
      'Min Stock',
    ],
  ];

  for (let i = 0; i < rowCount; i += 1) {
    rows.push([
      `Product ${i + 1}`,
      `SKU-${String(i + 1).padStart(5, '0')}`,
      'Bread',
      'pcs',
      40 + (i % 10),
      20 + (i % 5),
      5,
      100 + (i % 50),
      10,
    ]);
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Items');

  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

function buildExistingProductIndex(count: number): {
  byName: ProductNameIndex;
  byCode: ProductCodeIndex;
} {
  const byName = new Map();
  const byCode = new Map();

  for (let i = 0; i < count; i += 1) {
    const name = `Existing Product ${i + 1}`;
    const code = `EX-${String(i + 1).padStart(4, '0')}`;
    const match = { id: `prod-${i}`, name, code };

    byName.set(normalizeProductName(name), match);
    byCode.set(code.toUpperCase(), match);
  }

  return { byName, byCode };
}

/** Simulates Firestore .get() response processing into lookup maps. */
function simulateFirestoreIndexBuild(docs: ReadonlyArray<{ id: string; data: ProductDocument }>) {
  const byName = new Map();
  const byCode = new Map();

  for (const doc of docs) {
    const nameKey = normalizeProductName(doc.data.name);
    if (!byName.has(nameKey)) {
      byName.set(nameKey, { id: doc.id, name: doc.data.name, code: doc.data.code });
    }

    const code = doc.data.code?.trim();
    if (code) {
      const codeKey = code.toUpperCase();
      if (!byCode.has(codeKey)) {
        byCode.set(codeKey, { id: doc.id, name: doc.data.name, code: doc.data.code });
      }
    }
  }

  return { byName, byCode };
}

function createInstantFirestoreMock() {
  let batchCounter = 0;
  let docCounter = 0;

  const db = {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => ({ id: `doc-${++docCounter}` }),
        }),
      }),
    }),
    batch: () => {
      const writes: unknown[] = [];
      batchCounter += 1;

      return {
        set: (_ref: unknown, data: unknown) => {
          writes.push(data);
        },
        commit: async () => {
          // Instant — measures CPU-only document construction, not network.
        },
      };
    },
  };

  return { db: db as unknown as Firestore, batchCount: () => batchCounter };
}

function simulatePreviewWork(rows: readonly { status: string }[]) {
  const counts = { all: rows.length, valid: 0, warning: 0, error: 0 };

  for (const row of rows) {
    if (row.status === 'valid') counts.valid += 1;
    else if (row.status === 'warning') counts.warning += 1;
    else if (row.status === 'error') counts.error += 1;
  }

  const filtered = rows.filter((row) => row.status === 'valid');
  const pageRows = filtered.slice(0, PREVIEW_PAGE_SIZE);

  return { counts, pageRowCount: pageRows.length };
}

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function ms(start: number): number {
  return Math.round(performance.now() - start);
}

function forceGc() {
  if (typeof globalThis.gc === 'function') {
    globalThis.gc();
  }
}

type RowResult = {
  rows: number;
  fileSizeKb: number;
  parseMs: number;
  mapMs: number;
  normalizeMs: number;
  validateMs: number;
  pipelineMs: number;
  doubleParseMs: number;
  conflictMs: number;
  indexBuildMs: number;
  previewMs: number;
  serializeMs: number;
  payloadMb: number;
  commitMs: number;
  batchCount: number;
  heapDeltaMb: number;
  peakHeapMb: number;
};

async function benchmarkRowCount(rowCount: number): Promise<RowResult> {
  forceGc();
  const heapBefore = process.memoryUsage().heapUsed;

  const bytes = buildProductXlsx(rowCount);
  const fileSizeKb = Math.round(bytes.byteLength / 1024);

  const definition = productImportDefinition;

  let t0 = performance.now();
  const parsed = parseImportFile(bytes, { fileName: 'products.xlsx' });
  const parseMs = ms(t0);

  t0 = performance.now();
  const mapped = applyMapping(parsed, PRODUCT_MAPPING, definition.columns);
  const mapMs = ms(t0);

  t0 = performance.now();
  const normalized = normalizeRows(mapped.rows, definition.columns);
  const normalizeMs = ms(t0);

  t0 = performance.now();
  const validated = validateRows(normalized, definition.columns, definition.validation);
  const validateMs = ms(t0);

  t0 = performance.now();
  const report = runImport({
    data: bytes,
    fileName: 'products.xlsx',
    entityType: 'product',
    mapping: PRODUCT_MAPPING,
  });
  const pipelineMs = ms(t0);

  // analyzeImportAction parses twice (auto-map + runImport).
  t0 = performance.now();
  parseImportFile(bytes, { fileName: 'products.xlsx' });
  runImport({
    data: bytes,
    fileName: 'products.xlsx',
    entityType: 'product',
    mapping: PRODUCT_MAPPING,
  });
  const doubleParseMs = ms(t0);

  const existingDocs = Array.from({ length: EXISTING_PRODUCT_COUNT }, (_, i) => ({
    id: `prod-${i}`,
    data: {
      name: `Existing Product ${i + 1}`,
      code: `EX-${String(i + 1).padStart(4, '0')}`,
      category: 'Bread',
      unit: 'pcs',
      sellingPrice: 4500,
      costPrice: 2000,
      openingStock: 0,
      createdBy: 'u1',
      updatedBy: 'u1',
      createdAt: null,
      updatedAt: null,
      deletedAt: null,
    } as unknown as ProductDocument,
  }));

  t0 = performance.now();
  simulateFirestoreIndexBuild(existingDocs);
  const indexBuildMs = ms(t0);

  const { byName, byCode } = buildExistingProductIndex(EXISTING_PRODUCT_COUNT);

  t0 = performance.now();
  detectProductImportConflicts(report, byName, byCode);
  const conflictMs = ms(t0);

  t0 = performance.now();
  simulatePreviewWork(report.result.rows);
  const previewMs = ms(t0);

  t0 = performance.now();
  const serialized = JSON.stringify(report);
  const serializeMs = ms(t0);
  const payloadMb = serialized.length / (1024 * 1024);

  const { db, batchCount } = createInstantFirestoreMock();

  t0 = performance.now();
  await commitProductImport(db, report, { orgId: 'org-1', userId: 'user-1', batchSize: BATCH_SIZE });
  const commitMs = ms(t0);

  const heapAfter = process.memoryUsage().heapUsed;
  const peakHeapMb = heapAfter / (1024 * 1024);

  return {
    rows: rowCount,
    fileSizeKb,
    parseMs,
    mapMs,
    normalizeMs,
    validateMs,
    pipelineMs,
    doubleParseMs,
    conflictMs,
    indexBuildMs,
    previewMs,
    serializeMs,
    payloadMb,
    commitMs,
    batchCount: batchCount(),
    heapDeltaMb: (heapAfter - heapBefore) / (1024 * 1024),
    peakHeapMb,
  };
}

async function main() {
  console.log('Product Import Performance Benchmark');
  console.log('====================================');
  console.log(`Existing products simulated: ${EXISTING_PRODUCT_COUNT}`);
  console.log(`Commit batch size: ${BATCH_SIZE}`);
  console.log('');

  const results: RowResult[] = [];

  for (const count of ROW_COUNTS) {
    process.stdout.write(`Benchmarking ${count.toLocaleString()} rows... `);
    const result = await benchmarkRowCount(count);
    results.push(result);
    console.log('done');
  }

  console.log('');
  console.log('Results (milliseconds unless noted)');
  console.log('-----------------------------------');

  const header = [
    'Rows',
    'File',
    'Parse',
    'Map',
    'Norm',
    'Valid',
    'Pipeline',
    'Analyze*',
    'Conflict',
    'IdxBuild',
    'Preview',
    'Serialize',
    'Payload',
    'Commit',
    'Batches',
    'HeapΔ',
  ].join('\t');

  console.log(header);

  for (const r of results) {
    console.log(
      [
        r.rows,
        `${r.fileSizeKb}KB`,
        r.parseMs,
        r.mapMs,
        r.normalizeMs,
        r.validateMs,
        r.pipelineMs,
        r.doubleParseMs,
        r.conflictMs,
        r.indexBuildMs,
        r.previewMs,
        r.serializeMs,
        `${r.payloadMb.toFixed(2)}MB`,
        r.commitMs,
        r.batchCount,
        `${r.heapDeltaMb.toFixed(1)}MB`,
      ].join('\t'),
    );
  }

  console.log('');
  console.log('* Analyze = double parse (auto-map + runImport), as in analyzeImportAction');
  console.log('');
  console.log('Validation = parse + map + normalize + validate stages');
  console.log(`Preview = O(n) count + filter + first ${PREVIEW_PAGE_SIZE} rows (CPU only, no React)`);
  console.log('Commit = document build + batching (instant mock, no network latency)');
  console.log('IdxBuild = processing 500 Firestore product docs into Maps (no network)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
