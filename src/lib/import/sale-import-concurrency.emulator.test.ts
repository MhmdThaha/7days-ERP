/**
 * Phase 3 REAL Firestore concurrency — Firebase Emulator only.
 *
 * Never loads production credentials. Never writes days-bakery-erp-dev.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-bakeryos-phase3 -- "npx vitest run src/lib/import/sale-import-concurrency.emulator.test.ts"
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
  process.env.GCLOUD_PROJECT = 'demo-bakeryos-phase3';
  process.env.GOOGLE_CLOUD_PROJECT = 'demo-bakeryos-phase3';
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-bakeryos-phase3' });
  delete process.env.FIREBASE_ADMIN_PROJECT_ID;
  delete process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  delete process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
});

vi.mock('@/lib/firebase/admin', async () => {
  const { getApps, initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  function getEmulatorFirestore() {
    const existing = getApps().find((app) => app.name === 'phase3-concurrency');
    const app =
      existing ??
      initializeApp({ projectId: 'demo-bakeryos-phase3' }, 'phase3-concurrency');

    return getFirestore(app);
  }

  return {
    getAdminFirestore: getEmulatorFirestore,
  };
});

vi.mock('@/lib/services/daily-summary.service', () => ({
  dailySummaryService: {
    markDirtyAfterCommit: vi.fn(async () => undefined),
    scheduleRecalculationAfterCommit: vi.fn(async () => undefined),
  },
}));

import { Timestamp } from 'firebase-admin/firestore';

import { DomainError } from '@/lib/domain/errors';
import {
  DUPLICATE_IMPORT_RECOMMENDATION,
  DUPLICATE_IMPORT_STATUS,
} from '@/lib/import/duplicate';
import { executeSalesImport } from '@/lib/import/execution/sales-import-execution.service';
import { finalizeSalesImportInventory } from '@/lib/import/finalization/inventory-finalization.service';
import { SALES_DETAIL_REPORT } from '@/lib/import/reports/definitions';
import type { ImportReviewViewModelWithResolution, ResolvedImportReviewRow } from '@/lib/import/resolution/types';
import {
  AUTO_IMPORT_RECOMMENDATION,
  CONFIDENCE_LEVEL,
} from '@/lib/import/services/confidence-engine.service';
import { CONFLICT_ENGINE_STATUS } from '@/lib/import/services/conflict-engine.service';
import { PRODUCT_MATCH_STATUS } from '@/lib/import/services/product-matching.service';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { hashImportIdentity, importHistoryRepository } from '@/lib/repositories/import-history.repository';
import { saleRepository } from '@/lib/repositories/sale.repository';
import type { SaleLineItem } from '@/types/sale';

const USER = 'emulator-worker';
const BREAD_ID = 'prod-bread';
const CAKE_ID = 'prod-cake';

const noDuplicate = {
  status: DUPLICATE_IMPORT_STATUS.NO_DUPLICATE,
  confidence: 0,
  matchedImport: null,
  matchedInvoices: [] as string[],
  matchedRows: 0,
  duplicateRowFingerprints: [] as string[],
  duplicateReasons: [] as string[],
  recommendation: DUPLICATE_IMPORT_RECOMMENDATION.CONTINUE,
};

const breadLine: SaleLineItem = {
  id: 'sl-bread',
  productId: BREAD_ID,
  productNameSnapshot: 'Bread',
  productCodeSnapshot: 'BRD-001',
  sellingPriceSnapshot: 500,
  quantity: 10,
  unit: 'pcs',
  lineTotal: 5000,
  unitCost: 0,
  cogs: 0,
};

function orgId(suffix: string) {
  return `org-p3c-${suffix}-${Math.random().toString(36).slice(2, 8)}`;
}

async function emulatorIsUp(): Promise<boolean> {
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';

  try {
    const response = await fetch(`http://${host}/`);
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

async function startTogether<T>(workers: Array<() => Promise<T>>): Promise<PromiseSettledResult<T>[]> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = workers.map(async (worker) => {
    await gate;
    return worker();
  });
  release();
  return Promise.allSettled(started);
}

function db() {
  return getAdminFirestore();
}

function orgCol(org: string, collection: string) {
  return db().collection('organizations').doc(org).collection(collection);
}

async function seedProduct(org: string, id: string, name: string, code: string, stock: number, averageCost: number) {
  const now = Timestamp.now();
  await orgCol(org, 'products').doc(id).set({
    organizationId: org,
    code,
    name,
    category: 'Breads',
    unit: 'pcs',
    sellingPrice: 500,
    description: null,
    isActive: true,
    currentStock: stock,
    averageCost,
    activeRecipeId: null,
    imageUrl: null,
    createdAt: now,
    createdBy: USER,
    updatedAt: now,
    updatedBy: USER,
    deletedAt: null,
    deletedBy: null,
  });
}

async function listSales(org: string): Promise<Array<Record<string, unknown> & { id: string }>> {
  const snapshot = await orgCol(org, 'sales').where('deletedAt', '==', null).get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Record<string, unknown>),
  }));
}

async function listSourceSales(
  org: string,
  importId: string,
): Promise<Array<Record<string, unknown> & { id: string }>> {
  const snapshot = await orgCol(org, 'importHistory').doc(importId).collection('sourceSales').get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Record<string, unknown>),
  }));
}

async function listMovements(org: string) {
  const snapshot = await orgCol(org, 'inventoryMovements').get();
  return snapshot.docs.map((doc) => doc.data() as Record<string, unknown>);
}

function importableRow(
  rowNumber: number,
  values: Record<string, string | number>,
  productId: string,
  productName: string,
): ResolvedImportReviewRow {
  return {
    rowNumber,
    originalValues: {},
    normalizedValues: values,
    reportDetectionResult: {
      profile: SALES_DETAIL_REPORT,
      reportType: 'sales-detail',
      confidence: 0.9,
      matchedColumns: [],
      missingColumns: [],
      matchedHeaders: [],
      missingHeaders: [],
      unmatchedHeaders: [],
      explanation: [],
      candidates: [],
    },
    productMatchResult: {
      status: PRODUCT_MATCH_STATUS.MATCHED,
      matchedProductId: productId,
      matchedProductName: productName,
      confidence: 98,
      reason: 'Exact Name Match',
    },
    conflictEngineResult: {
      status: CONFLICT_ENGINE_STATUS.READY,
      conflicts: [],
      warnings: [],
      blockingReason: null,
      recommendedAction: null,
      confidencePenalty: 0,
    },
    confidenceResult: {
      confidenceScore: 90,
      confidenceLevel: CONFIDENCE_LEVEL.HIGH,
      confidenceReasons: [],
      autoImportRecommendation: AUTO_IMPORT_RECOMMENDATION.PREVIEW_FIRST,
    },
  };
}

function review(rows: ResolvedImportReviewRow[]): ImportReviewViewModelWithResolution {
  return {
    overview: {
      fileName: 'sales.csv',
      detectedReportName: 'Sales Detail',
      detectedReportType: 'sales-detail',
      reportConfidence: 0.9,
      headerRowIndex: 0,
      totalRows: rows.length,
      readyRows: rows.length,
      warningRows: 0,
      errorRows: 0,
      averageConfidence: 90,
      autoImportEligibleRows: 0,
      blockedRows: 0,
    },
    reportSummary: {
      matchedColumns: [],
      missingRequiredColumns: [],
      extraColumns: [],
      unknownHeaders: [],
      detectionReasons: [],
    },
    rows,
  };
}

function numberedRows(count: number): ResolvedImportReviewRow[] {
  return Array.from({ length: count }, (_, index) =>
    importableRow(
      index + 2,
      {
        saleDate: '2026-03-15',
        customerName: 'Ravi',
        productName: 'Bread',
        productCode: 'BRD-001',
        quantity: 10,
        sellingPrice: 50,
        saleNumber: `INV-${String(index + 1).padStart(2, '0')}`,
      },
      BREAD_ID,
      'Bread',
    ),
  );
}

const emulatorReady = await emulatorIsUp();

describe.skipIf(!emulatorReady)('Phase 3 Firestore emulator concurrency', () => {
  beforeAll(() => {
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
    expect(process.env.FIREBASE_ADMIN_PRIVATE_KEY).toBeUndefined();
  });

  it('TEST 1 — two workers creating the same source sale produce one Sale and one link', async () => {
    const org = orgId('t1');
    const session = await importHistoryRepository.beginOrResume(org, USER, {
      reportType: 'sales-detail',
      rowCount: 1,
      fileFingerprint: `fp-t1-${org}`,
      invoiceNumbers: [],
      rowFingerprints: ['row-50'],
    });
    const groupKey = 'fallback:2026-03-15|ravi';
    const input = {
      saleDate: '2026-03-15',
      customerNameSnapshot: 'Ravi',
      lines: [breadLine],
      subtotal: 5000,
      importSource: { importId: session.history.importId, groupKey },
    };

    const results = await startTogether([
      () => saleRepository.create(org, input, 'worker-a'),
      () => saleRepository.create(org, input, 'worker-b'),
    ]);

    const created = results
      .filter((entry) => entry.status === 'fulfilled')
      .map((entry) => entry.value);
    const sales = await listSales(org);
    const links = await listSourceSales(org, session.history.importId);

    expect(results.every((entry) => entry.status === 'fulfilled')).toBe(true);
    expect(created).toHaveLength(2);
    expect(created[0]?.id).toBe(created[1]?.id);
    expect(sales).toHaveLength(1);
    expect(links).toHaveLength(1);
    expect(links[0]?.saleId).toBe(sales[0]?.id);
  }, 60_000);

  it('TEST 2 — two concurrent retries of a 20-sale numbered import create 20 Sales, not 40', async () => {
    const org = orgId('t2');
    await seedProduct(org, BREAD_ID, 'Bread', 'BRD-001', 1000, 300);
    const rows = numberedRows(20);

    const results = await startTogether([
      () =>
        executeSalesImport({
          resolvedReview: review(rows),
          duplicateResult: noDuplicate,
          reportType: 'sales-detail',
          orgId: org,
          userId: 'worker-a',
        }),
      () =>
        executeSalesImport({
          resolvedReview: review(rows),
          duplicateResult: noDuplicate,
          reportType: 'sales-detail',
          orgId: org,
          userId: 'worker-b',
        }),
    ]);

    const executions = results
      .filter((entry) => entry.status === 'fulfilled')
      .map((entry) => entry.value);
    const sales = await listSales(org);
    const importIds = [...new Set(executions.map((entry) => entry.importId).filter(Boolean))];
    const links = importIds[0] ? await listSourceSales(org, importIds[0]) : [];

    expect(results.every((entry) => entry.status === 'fulfilled')).toBe(true);
    expect(importIds).toHaveLength(1);
    expect(sales).toHaveLength(20);
    expect(links).toHaveLength(20);
    expect(new Set(sales.map((sale) => sale.id)).size).toBe(20);
  }, 60_000);

  it('TEST 3 — unnumbered concurrent retry keeps grouping and does not duplicate source identities', async () => {
    const org = orgId('t3');
    await seedProduct(org, BREAD_ID, 'Bread', 'BRD-001', 100, 300);
    await seedProduct(org, CAKE_ID, 'Cake', 'CKE-010', 100, 800);
    const rows = [
      importableRow(
        2,
        {
          saleDate: '2026-03-15',
          customerName: 'Ravi',
          productName: 'Bread',
          productCode: 'BRD-001',
          quantity: 10,
          sellingPrice: 50,
        },
        BREAD_ID,
        'Bread',
      ),
      importableRow(
        3,
        {
          saleDate: '2026-03-15',
          customerName: 'Ravi',
          productName: 'Cake',
          productCode: 'CKE-010',
          quantity: 2,
          sellingPrice: 120,
        },
        CAKE_ID,
        'Cake',
      ),
    ];

    const results = await startTogether([
      () =>
        executeSalesImport({
          resolvedReview: review(rows),
          duplicateResult: noDuplicate,
          reportType: 'sales-detail',
          orgId: org,
          userId: 'worker-a',
        }),
      () =>
        executeSalesImport({
          resolvedReview: review(rows),
          duplicateResult: noDuplicate,
          reportType: 'sales-detail',
          orgId: org,
          userId: 'worker-b',
        }),
    ]);

    const executions = results
      .filter((entry) => entry.status === 'fulfilled')
      .map((entry) => entry.value);
    const sales = await listSales(org);
    const importId = executions[0]?.importId;
    const links = importId ? await listSourceSales(org, importId) : [];

    expect(results.every((entry) => entry.status === 'fulfilled')).toBe(true);
    expect(sales).toHaveLength(1);
    expect(links).toHaveLength(1);
    expect(links[0]?.groupKey).toBe('fallback:2026-03-15|ravi');
    expect(sales[0]?.lineCount).toBe(2);
  }, 60_000);

  it('TEST 4 — concurrent complete of one draft consumes inventory once', async () => {
    const org = orgId('t4');
    await seedProduct(org, BREAD_ID, 'Bread', 'BRD-001', 100, 300);
    const draft = await saleRepository.create(
      org,
      {
        saleDate: '2026-03-15',
        customerNameSnapshot: 'Ravi',
        lines: [breadLine],
        subtotal: 5000,
      },
      USER,
    );

    const results = await startTogether([
      () => saleRepository.complete(org, draft.id, 'worker-a'),
      () => saleRepository.complete(org, draft.id, 'worker-b'),
    ]);

    const fulfilled = results.filter((entry) => entry.status === 'fulfilled');
    const rejected = results.filter((entry) => entry.status === 'rejected');
    const sales = await listSales(org);
    const product = (await orgCol(org, 'products').doc(BREAD_ID).get()).data();
    const movements = await listMovements(org);
    const saleOut = movements.filter((movement) => movement.movementType === 'SALE_OUT');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.status === 'rejected' && rejected[0].reason).toBeInstanceOf(DomainError);
    expect(sales).toHaveLength(1);
    expect(sales[0]?.status).toBe('completed');
    expect(sales[0]?.totalCogs).toBe(3000);
    expect(product?.currentStock).toBe(90);
    expect(product?.averageCost).toBe(300);
    expect(saleOut).toHaveLength(1);
    expect(saleOut[0]?.quantity).toBe(10);
    expect(saleOut[0]?.totalCost).toBe(3000);
  }, 60_000);

  it('TEST 5 — concurrent retry of a partial import ends at 20 Sales without second inventory', async () => {
    const org = orgId('t5');
    await seedProduct(org, BREAD_ID, 'Bread', 'BRD-001', 1000, 300);
    const rows = numberedRows(20);
    const first = await executeSalesImport({
      resolvedReview: review(rows),
      duplicateResult: noDuplicate,
      reportType: 'sales-detail',
      orgId: org,
      userId: USER,
    });

    expect(first.importId).toBeTruthy();
    const importId = first.importId!;
    const createdIds = [...first.saleIds];

    for (const saleId of createdIds.slice(0, 10)) {
      await saleRepository.complete(org, saleId, USER);
    }

    for (const saleId of createdIds.slice(15, 20)) {
      const saleRef = orgCol(org, 'sales').doc(saleId);
      const saleSnap = await saleRef.get();
      const saleNumber = String(saleSnap.data()?.saleNumber ?? '');
      await saleRef.delete();
      await orgCol(org, 'uniqueNumbers').doc(`sale_${saleNumber}`).delete();
      await orgCol(org, 'importHistory')
        .doc(importId)
        .collection('sourceSales')
        .doc(hashImportIdentity(`number:${saleNumber}`))
        .delete();
    }

    await orgCol(org, 'importHistory').doc(importId).update({
      saleIds: createdIds.slice(0, 15),
      status: 'IMPORTING',
    });

    const retry = () =>
      executeSalesImport({
        resolvedReview: review(rows),
        duplicateResult: noDuplicate,
        reportType: 'sales-detail',
        orgId: org,
        userId: USER,
      }).then(async (execution) => {
        const finalization = await finalizeSalesImportInventory({
          executionResult: execution,
          orgId: org,
          userId: USER,
        });
        return { execution, finalization };
      });

    const results = await startTogether([retry, retry]);
    const sales = await listSales(org);
    const links = await listSourceSales(org, importId);
    const movements = (await listMovements(org)).filter((movement) => movement.movementType === 'SALE_OUT');
    const product = (await orgCol(org, 'products').doc(BREAD_ID).get()).data();
    const completed = sales.filter((sale) => sale.status === 'completed');
    const history = await importHistoryRepository.getById(org, importId);

    expect(results.every((entry) => entry.status === 'fulfilled')).toBe(true);
    expect(sales).toHaveLength(20);
    expect(links).toHaveLength(20);
    expect(completed).toHaveLength(20);
    expect(movements).toHaveLength(20);
    expect(product?.currentStock).toBe(800);
    expect(product?.averageCost).toBe(300);
    expect(history?.status).toBe('COMPLETED');
  }, 120_000);

  it('TEST 6 — concurrent beginOrResume converges on one importId for the same file lock', async () => {
    const org = orgId('t6');
    const fingerprint = `fp-lock-${org}`;
    const input = {
      reportType: 'sales-detail',
      rowCount: 1,
      fileFingerprint: fingerprint,
      invoiceNumbers: ['INV-1'] as const,
      rowFingerprints: ['row-1'] as const,
    };

    const results = await startTogether([
      () => importHistoryRepository.beginOrResume(org, 'worker-a', input),
      () => importHistoryRepository.beginOrResume(org, 'worker-b', input),
    ]);

    const sessions = results
      .filter((entry) => entry.status === 'fulfilled')
      .map((entry) => entry.value);
    const lockSnap = await orgCol(org, 'importFileLocks').doc(hashImportIdentity(fingerprint)).get();
    const historySnap = await orgCol(org, 'importHistory').get();

    expect(results.every((entry) => entry.status === 'fulfilled')).toBe(true);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.history.importId).toBe(sessions[1]?.history.importId);
    expect(lockSnap.data()?.importId).toBe(sessions[0]?.history.importId);
    expect(historySnap.size).toBe(1);
  }, 60_000);

  it('TEST 7 — the same fingerprint in two organizations does not share imports or Sales', async () => {
    const orgA = orgId('t7a');
    const orgB = orgId('t7b');
    const fingerprint = 'shared-looking-file-fingerprint';
    const groupKey = 'fallback:2026-03-15|ravi';
    const input = {
      saleDate: '2026-03-15',
      customerNameSnapshot: 'Ravi',
      lines: [breadLine],
      subtotal: 5000,
    };

    const [sessionA, sessionB] = await Promise.all([
      importHistoryRepository.beginOrResume(orgA, USER, {
        reportType: 'sales-detail',
        rowCount: 1,
        fileFingerprint: fingerprint,
        invoiceNumbers: [],
        rowFingerprints: ['row-1'],
      }),
      importHistoryRepository.beginOrResume(orgB, USER, {
        reportType: 'sales-detail',
        rowCount: 1,
        fileFingerprint: fingerprint,
        invoiceNumbers: [],
        rowFingerprints: ['row-1'],
      }),
    ]);

    const [saleA, saleB] = await Promise.all([
      saleRepository.create(
        orgA,
        { ...input, importSource: { importId: sessionA.history.importId, groupKey } },
        USER,
      ),
      saleRepository.create(
        orgB,
        { ...input, importSource: { importId: sessionB.history.importId, groupKey } },
        USER,
      ),
    ]);

    const salesA = await listSales(orgA);
    const salesB = await listSales(orgB);

    expect(sessionA.history.importId).not.toBe(sessionB.history.importId);
    expect(saleA.id).not.toBe(saleB.id);
    expect(salesA).toHaveLength(1);
    expect(salesB).toHaveLength(1);
    expect(salesA[0]?.organizationId).toBe(orgA);
    expect(salesB[0]?.organizationId).toBe(orgB);
  }, 60_000);
});

describe.skipIf(emulatorReady)('Phase 3 Firestore emulator concurrency (unavailable)', () => {
  it('does not claim concurrency success without the emulator', () => {
    expect(emulatorReady).toBe(false);
  });
});
