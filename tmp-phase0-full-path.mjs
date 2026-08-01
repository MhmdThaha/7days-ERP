/**
 * [PERF-GLOBAL-TEMP] Phase 0 full-path benchmark — auth stays in-process, never printed.
 * Hits local prod server (3020) and production Vercel with instrumented build.
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

async function mintSession() {
  const ct = await auth.createCustomToken(uid);
  const si = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: ct, returnSecureToken: true }),
    },
  );
  const { idToken } = await si.json();
  return auth.createSessionCookie(idToken, { expiresIn: 60 * 60 * 24 * 5 * 1000 });
}

async function timeFetch(label, url, init = {}) {
  const start = performance.now();
  const res = await fetch(url, init);
  const ms = performance.now() - start;
  const middleware = res.headers.get('x-perf-middleware-ms');
  return { label, ms, status: res.status, middleware };
}

const sessionCookie = await mintSession();
const cookieHeader = { Cookie: `session=${sessionCookie}` };

console.log('=== PHASE 0 BASELINE (authenticated paths) ===\n');

const targets = [
  { name: 'local-prod', base: 'http://localhost:3020' },
  { name: 'vercel-prod', base: 'https://7days-erp.vercel.app' },
];

for (const { name, base } of targets) {
  console.log(`--- ${name} (${base}) ---`);
  const loginSim = await timeFetch('POST /api/auth/session (login sync sim)', `${base}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: (await (async () => {
      const ct = await auth.createCustomToken(uid);
      const si = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: ct, returnSecureToken: true }) },
      );
      return (await si.json()).idToken;
    })()) }),
  });

  const ssr1 = await timeFetch('GET /products SSR (cold-ish)', `${base}/products`, {
    headers: cookieHeader,
    redirect: 'manual',
  });
  const ssr2 = await timeFetch('GET /products SSR (warm)', `${base}/products`, {
    headers: cookieHeader,
    redirect: 'manual',
  });

  for (const r of [loginSim, ssr1, ssr2]) {
    console.log(
      `  ${r.label}: ${r.ms.toFixed(0)} ms | HTTP ${r.status}` +
        (r.middleware ? ` | middleware ${r.middleware} ms` : ''),
    );
  }
  console.log('');
}

console.log('Check local server terminal for [PERF-GLOBAL] SSR/action/firestore breakdown.');
process.exit(0);
