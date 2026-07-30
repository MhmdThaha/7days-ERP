/**
 * [PERF-GLOBAL-TEMP] READ-ONLY benchmark for global authenticated request path.
 * Simulates: session verify (if cookie available), user read, products list query.
 * NO WRITES.
 */
import { config } from 'dotenv';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
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
const auth = getAuth();
const uid = 'a3B2rvSFoRToKzGg7gLahDIbCs63';
const orgId = 'mu71xTRXs9MubZgbAuGE';

async function timeIt(label, fn) {
  const start = performance.now();
  const result = await fn();
  const ms = performance.now() - start;
  console.log(`${label}: ${ms.toFixed(0)} ms`);
  return { ms, result };
}

console.log('========================================');
console.log('GLOBAL PERF BENCHMARK (read-only)');
console.log('========================================\n');

// Cold start: admin SDK init + first Firestore op
const coldStart = performance.now();
await db.collection('users').doc(uid).get();
console.log(`COLD admin init + first Firestore op: ${(performance.now() - coldStart).toFixed(0)} ms\n`);

async function runAuthenticatedPath(runLabel) {
  console.log(`--- ${runLabel} ---`);
  let total = 0;
  const add = (r) => {
    total += r.ms;
    return r.result;
  };

  // User profile read (includes orgId — no separate org document read in auth path)
  const profileSnap = add(
    await timeIt('user profile read (users/{uid})', () => db.collection('users').doc(uid).get()),
  );
  const profile = profileSnap.data();
  const resolvedOrgId = profile?.organizationId ?? orgId;

  // Session verification — create a custom token, exchange not possible without client SDK.
  // Instead measure verifySessionCookie using a freshly minted session cookie via custom token flow:
  // Admin can create custom token -> we'd need client to get idToken. Skip unless SESSION_COOKIE env set.
  const sessionCookie = process.env.PERF_SESSION_COOKIE?.trim();
  if (sessionCookie) {
    add(
      await timeIt('session verify (verifySessionCookie)', () =>
        auth.verifySessionCookie(sessionCookie, true),
      ),
    );
  } else {
    console.log('session verify (verifySessionCookie): SKIPPED — set PERF_SESSION_COOKIE to measure');
  }

  // Products list — exact query from productRepository.list
  const productsSnap = add(
    await timeIt('products query (deletedAt==null, full collection scan)', () =>
      db
        .collection('organizations')
        .doc(resolvedOrgId)
        .collection('products')
        .where('deletedAt', '==', null)
        .get(),
    ),
  );
  console.log(`   products returned: ${productsSnap.size} documents`);

  // In-memory processing simulation
  const processStart = performance.now();
  const items = productsSnap.docs
    .map((doc) => doc.data())
    .filter((p) => p.isActive === true)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const processMs = performance.now() - processStart;
  total += processMs;
  console.log(`in-memory filter/sort (active only): ${processMs.toFixed(0)} ms | active=${items.length}`);

  console.log(`--- ${runLabel} TOTAL (server-side reads): ${total.toFixed(0)} ms ---\n`);
  return total;
}

const run1 = await runAuthenticatedPath('RUN 1 (warm)');
const run2 = await runAuthenticatedPath('RUN 2 (warm repeat)');

console.log('========================================');
console.log('SUMMARY');
console.log('========================================');
console.log(`Warm authenticated path (user read + products query): ~${run2.toFixed(0)} ms`);
console.log('Note: Each server action also repeats auth (session verify + user read).');
console.log('Note: SSR layout auth runs the same path before page HTML is sent.');
console.log('Reads per products page load (minimum):');
console.log('  SSR layout: 1 session verify + 1 user read');
console.log('  listProductsAction: 1 session verify + 1 user read + 1 products query');
console.log('  = 2 session verifies + 2 user reads + 1 products query (sequential, not parallel)');
console.log('Organization lookup: NOT PERFORMED (orgId embedded in user profile document)');

process.exit(0);
