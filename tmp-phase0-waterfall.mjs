/**
 * [PERF-GLOBAL-TEMP] Phase 0 — simulate full browser waterfall via sequential HTTP.
 * Mimics: login session POST → navigate products SSR → server action (via direct import).
 * Cookie never printed.
 */
import { config } from 'dotenv';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

config({ path: '.env.local', quiet: true });

function nk(raw) {
  let k = (raw ?? '').trim();
  while ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'")))
    k = k.slice(1, -1).trim();
  if (k.endsWith(',')) k = k.slice(0, -1).trim();
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

const auth = getAuth();
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const uid = 'a3B2rvSFoRToKzGg7gLahDIbCs63';

const marks = [];
function mark(step, ms, extra = '') {
  marks.push({ step, ms, extra });
  console.log(`  [${ms.toFixed(0).padStart(5)} ms] ${step}${extra ? ` — ${extra}` : ''}`);
}

async function getIdToken() {
  const ct = await auth.createCustomToken(uid);
  const si = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: ct, returnSecureToken: true }),
    },
  );
  return (await si.json()).idToken;
}

async function runWaterfall(base, label) {
  console.log(`\n========== ${label} (${base}) ==========`);
  const t0 = performance.now();

  // Step A: Login — client obtains idToken (Firebase REST simulates client SDK)
  const tA = performance.now();
  const idToken = await getIdToken();
  mark('A. Firebase client auth (custom token → idToken)', performance.now() - tA);

  // Step B: Login — POST /api/auth/session (syncServerSessionFromUser)
  const tB = performance.now();
  const sessionRes = await fetch(`${base}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  mark('B. POST /api/auth/session (session sync)', performance.now() - tB, `HTTP ${sessionRes.status}`);

  const setCookie = sessionRes.headers.get('set-cookie') ?? '';
  const cookieMatch = setCookie.match(/session=([^;]+)/);
  const sessionCookie = cookieMatch?.[1] ?? '';
  if (!sessionCookie) {
    console.log('  ERROR: no session cookie returned');
    return;
  }

  // Step C: Navigate to /products (SSR document)
  const tC = performance.now();
  const ssrRes = await fetch(`${base}/products`, {
    headers: { Cookie: `session=${sessionCookie}` },
    redirect: 'manual',
  });
  const middlewareMs = ssrRes.headers.get('x-perf-middleware-ms');
  mark(
    'C. GET /products SSR document',
    performance.now() - tC,
    `HTTP ${ssrRes.status}${middlewareMs ? `, middleware ${middlewareMs}ms` : ''}`,
  );

  // Step D: Server action — listProductsAction via Next.js action POST
  const tD = performance.now();
  const actionBody = JSON.stringify([
    { search: '', status: 'active', page: 1, pageSize: 25 },
  ]);
  const actionRes = await fetch(`${base}/products`, {
    method: 'POST',
    headers: {
      Cookie: `session=${sessionCookie}`,
      'Content-Type': 'text/plain;charset=UTF-8',
      'Next-Action': 'listProductsAction',
      Accept: 'text/x-component',
    },
    body: actionBody,
  });
  mark(
    'D. listProductsAction (server action)',
    performance.now() - tD,
    `HTTP ${actionRes.status}`,
  );

  const total = performance.now() - t0;
  console.log(`\n  TOTAL sequential waterfall: ${total.toFixed(0)} ms`);
  console.log('  (Browser hydration + BakeryGate wait: NOT included — requires real browser)');
  return { marks, total };
}

await runWaterfall('http://localhost:3020', 'LOCAL PRODUCTION (instrumented)');
await runWaterfall('https://7days-erp.vercel.app', 'VERCEL PRODUCTION');

process.exit(0);
