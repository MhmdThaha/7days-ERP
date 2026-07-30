/**
 * [PERF-GLOBAL-TEMP] Measure Firebase session cookie verification latency.
 * Uses admin custom token -> idToken -> session cookie -> verifySessionCookie.
 */
import { config } from 'dotenv';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

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

const auth = getAuth();
const uid = 'a3B2rvSFoRToKzGg7gLahDIbCs63';
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

async function timeIt(label, fn) {
  const start = performance.now();
  const result = await fn();
  const ms = performance.now() - start;
  console.log(`${label}: ${ms.toFixed(0)} ms`);
  return { ms, result };
}

console.log('========================================');
console.log('SESSION VERIFICATION BENCHMARK');
console.log('========================================\n');

// Mint session cookie (same path as POST /api/auth/session minus HTTP overhead)
const customToken = (await timeIt('createCustomToken', () => auth.createCustomToken(uid))).result;

const signInRes = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  },
);
const signInJson = await signInRes.json();
if (!signInJson.idToken) {
  console.error('Failed to exchange custom token:', signInJson);
  process.exit(1);
}
console.log(`signInWithCustomToken (REST): ${signInJson.idToken.length} byte idToken received`);

const idToken = signInJson.idToken;

await timeIt('verifyIdToken', () => auth.verifyIdToken(idToken));
const sessionCookie = (
  await timeIt('createSessionCookie', () =>
    auth.createSessionCookie(idToken, { expiresIn: 60 * 60 * 24 * 5 * 1000 }),
  )
).result;

console.log('\n--- verifySessionCookie (warm, 5 runs) ---');
const verifyTimes = [];
for (let i = 1; i <= 5; i++) {
  const start = performance.now();
  await auth.verifySessionCookie(sessionCookie, true);
  const ms = performance.now() - start;
  verifyTimes.push(ms);
  console.log(`  run ${i}: ${ms.toFixed(0)} ms`);
}
const avg = verifyTimes.reduce((a, b) => a + b, 0) / verifyTimes.length;
console.log(`  average: ${avg.toFixed(0)} ms`);

console.log('\nFull auth path per getAuthenticatedContext() call:');
console.log(`  verifySessionCookie (~${avg.toFixed(0)} ms) + user read (~100 ms) = ~${(avg + 100).toFixed(0)} ms`);
console.log('Products page minimum server auth work:');
console.log(`  SSR layout: ~${(avg + 100).toFixed(0)} ms`);
console.log(`  listProductsAction: ~${(avg + 100).toFixed(0)} ms + products query (~150 ms)`);
console.log(`  Sequential total (no caching across requests): ~${(2 * avg + 200 + 150).toFixed(0)} ms`);

process.exit(0);
