/**
 * [PERF-TEMP] READ-ONLY Firestore latency benchmark for the Recipe Create flow.
 * Replicates the exact reads/queries the flow performs. NO WRITES.
 */
import { config } from 'dotenv';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

config({ path: '.env.local', quiet: true });

function normalizePrivateKey(raw) {
  let key = (raw ?? '').trim();
  while (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }
  if (key.endsWith(',')) key = key.slice(0, -1).trim();
  if (key.endsWith('"') || key.endsWith("'")) key = key.slice(0, -1).trim();
  if (key.startsWith('"') || key.startsWith("'")) key = key.slice(1).trim();
  return key.replace(/\\n/g, '\n').trim();
}

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY),
    }),
  });
}

const db = getFirestore();
const orgId = 'mu71xTRXs9MubZgbAuGE';
const productId = '7dF6MbsBgcMBoDmh7GGs';
const uid = 'a3B2rvSFoRToKzGg7gLahDIbCs63';

const orgRef = db.collection('organizations').doc(orgId);

async function timeIt(label, fn) {
  const start = performance.now();
  const result = await fn();
  const ms = performance.now() - start;
  console.log(`${label}: ${ms.toFixed(0)} ms`);
  return { ms, result };
}

async function runFlow(runLabel) {
  console.log(`\n===== ${runLabel} =====`);
  let total = 0;
  const add = (r) => {
    total += r.ms;
    return r.result;
  };

  // 1. Auth profile read (getAuthenticatedContext -> users/{uid})
  add(await timeIt('1. auth profile read (users/{uid}.get)', () =>
    db.collection('users').doc(uid).get()));

  // 2. Product lookup
  add(await timeIt('2. product lookup (products/{id}.get)', () =>
    orgRef.collection('products').doc(productId).get()));

  // 3. Duplicate active recipe check
  add(await timeIt('3. duplicate check (recipes where productId==X, deletedAt==null)', () =>
    orgRef
      .collection('recipes')
      .where('productId', '==', productId)
      .where('deletedAt', '==', null)
      .get()));

  // 4. getHighestCodeNumber (full non-deleted recipes scan)
  add(await timeIt('4. code gen: getHighestCodeNumber (recipes where deletedAt==null)', () =>
    orgRef.collection('recipes').where('deletedAt', '==', null).get()));

  // 5. findByCode
  add(await timeIt('5. code gen: findByCode (recipes where recipeCode==RCP-999)', () =>
    orgRef
      .collection('recipes')
      .where('recipeCode', '==', 'RCP-999')
      .where('deletedAt', '==', null)
      .limit(1)
      .get()));

  // Discover raw materials for ingredient reads
  const rawMaterialsSnap = await orgRef.collection('rawMaterials').get();
  const rawIds = rawMaterialsSnap.docs.map((d) => d.id);
  console.log(`   (org has ${rawIds.length} raw materials)`);

  // 6. Sequential ingredient reads — exactly what resolveIngredients() does
  const seqStart = performance.now();
  for (const id of rawIds) {
    await orgRef.collection('rawMaterials').doc(id).get();
  }
  const seqMs = performance.now() - seqStart;
  total += seqMs;
  console.log(`6. resolve ingredients SEQUENTIAL (${rawIds.length} reads): ${seqMs.toFixed(0)} ms`);

  // 6b. Same reads in parallel — for comparison only
  const parStart = performance.now();
  await Promise.all(rawIds.map((id) => orgRef.collection('rawMaterials').doc(id).get()));
  const parMs = performance.now() - parStart;
  console.log(`6b. same reads PARALLEL (comparison only): ${parMs.toFixed(0)} ms`);

  console.log(
    `-- Flow read-side total (sequential, as production code runs it): ${total.toFixed(0)} ms`,
  );
  console.log(
    `   (writes not measured: benchmark is read-only; each write = 1 more round-trip)`,
  );
}

const initStart = performance.now();
await db.collection('users').doc(uid).get();
console.log(
  `COLD first Firestore op (gRPC channel + TLS + auth handshake): ${(performance.now() - initStart).toFixed(0)} ms`,
);

await runFlow('RUN 1 (warm channel)');
await runFlow('RUN 2 (warm channel, repeat)');

process.exit(0);
