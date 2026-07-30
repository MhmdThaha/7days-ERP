/**
 * [PERF-GLOBAL-TEMP] Measure production session API and estimate full page path
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
const base = 'https://7days-erp.vercel.app';

const customToken = await auth.createCustomToken(uid);
const signInRes = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  },
);
const { idToken } = await signInRes.json();

console.log('--- POST /api/auth/session (production) ---');
for (let run = 1; run <= 3; run++) {
  const start = performance.now();
  const res = await fetch(`${base}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  console.log(`run${run}: HTTP ${res.status} | ${(performance.now() - start).toFixed(0)} ms`);
}

const sessionCookie = await auth.createSessionCookie(idToken, {
  expiresIn: 60 * 60 * 24 * 5 * 1000,
});

console.log('\n--- GET /api/auth/session (production, session verify only) ---');
for (let run = 1; run <= 3; run++) {
  const start = performance.now();
  const res = await fetch(`${base}/api/auth/session`, {
    headers: { Cookie: `session=${sessionCookie}` },
  });
  console.log(`run${run}: HTTP ${res.status} | ${(performance.now() - start).toFixed(0)} ms`);
}

console.log('\n--- GET /products SSR (authenticated, production) ---');
for (let run = 1; run <= 3; run++) {
  const start = performance.now();
  const res = await fetch(`${base}/products`, {
    headers: { Cookie: `session=${sessionCookie}` },
    redirect: 'manual',
  });
  console.log(`run${run}: HTTP ${res.status} | ${(performance.now() - start).toFixed(0)} ms`);
}

process.exit(0);
