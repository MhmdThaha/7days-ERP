/**
 * BakeryOS Master BAT — production HTTP + timing (read-only, no mutations).
 */
import { readFileSync } from 'fs';
import { config } from 'dotenv';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

config({ path: '.env.local', quiet: true });

const BASE = 'https://7days-erp.vercel.app';
const sessionLine = readFileSync('tmp-bat-session.json', 'utf8').trim();
const { sessionCookie, uid } = JSON.parse(sessionLine);

function nk(raw) {
  let k = (raw ?? '').trim();
  while ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'")))
    k = k.slice(1, -1).trim();
  return k.replace(/\\n/g, '\n').trim();
}

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: nk(process.env.FIREBASE_ADMIN_PRIVATE_KEY),
    }),
  });
}

const db = getFirestore();

async function fetchTimed(path, { auth = true, method = 'GET' } = {}) {
  const headers = {};
  if (auth) headers.Cookie = `session=${sessionCookie}`;
  const t0 = performance.now();
  const res = await fetch(`${BASE}${path}`, { method, headers, redirect: 'manual' });
  const ms = +(performance.now() - t0).toFixed(0);
  const location = res.headers.get('location') ?? '';
  let title = '';
  if (res.headers.get('content-type')?.includes('text/html')) {
    const html = await res.text();
    const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    title = m?.[1]?.trim() ?? '';
  }
  return { path, status: res.status, ms, location, title };
}

const routes = [
  '/',
  '/products',
  '/products/new',
  '/recipes',
  '/recipes/new',
  '/raw-materials',
  '/purchases',
  '/purchases/new',
  '/production',
  '/production/new',
  '/sales',
  '/sales/new',
  '/inventory',
  '/reports',
  '/daily-summary',
  '/monthly-summary',
  '/expenses',
  '/returns',
  '/wastage',
  '/settings',
  '/login',
  '/register',
];

console.log('=== BAT PRODUCTION HTTP ===');
console.log(`User: ${uid}`);
console.log(`Base: ${BASE}\n`);

console.log('-- Unauthenticated redirects --');
for (const path of ['/', '/products', '/production/new']) {
  const r = await fetchTimed(path, { auth: false });
  console.log(`${path} → ${r.status} ${r.location ? '→ ' + r.location : ''} (${r.ms}ms)`);
}

console.log('\n-- Authenticated page loads (TTFB) --');
const timings = [];
for (const path of routes) {
  const r = await fetchTimed(path);
  timings.push(r);
  const ok = r.status === 200 ? 'OK' : r.status >= 300 && r.status < 400 ? 'REDIR' : 'FAIL';
  console.log(`[${String(r.ms).padStart(5)}ms] ${r.status} ${ok} ${path} ${r.title ? '| ' + r.title : ''}`);
}

console.log('\n-- Session API --');
const sessionGet = await fetch(`${BASE}/api/auth/session`, {
  headers: { Cookie: `session=${sessionCookie}` },
});
console.log(`GET /api/auth/session → ${sessionGet.status} (${await sessionGet.text() === 'OK' ? 'valid' : 'body not OK'})`);

console.log('\n-- Firestore org snapshot --');
const userDoc = await db.collection('users').doc(uid).get();
const orgId = userDoc.data()?.organizationId;
console.log(`Org: ${orgId}`);
if (orgId) {
  const counts = {};
  for (const col of ['products', 'recipes', 'rawMaterials', 'purchases', 'productions', 'sales', 'suppliers']) {
    const snap = await db.collection(`organizations/${orgId}/${col}`).where('deletedAt', '==', null).get();
    counts[col] = snap.size;
  }
  console.log('Counts:', JSON.stringify(counts));
}

console.log('\n-- Performance summary --');
const authed = timings.filter((t) => t.path !== '/login' && t.path !== '/register' && t.status === 200);
const sorted = [...authed].sort((a, b) => b.ms - a.ms);
console.log(`Slowest: ${sorted[0]?.path} (${sorted[0]?.ms}ms)`);
console.log(`Fastest: ${sorted[sorted.length - 1]?.path} (${sorted[sorted.length - 1]?.ms}ms)`);
console.log(`Median: ${sorted[Math.floor(sorted.length / 2)]?.ms}ms`);
console.log(`Average: ${Math.round(authed.reduce((s, t) => s + t.ms, 0) / authed.length)}ms`);
