/**
 * [PERF-GLOBAL-TEMP] Measure authenticated production TTFB for /products
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
const sessionCookie = await auth.createSessionCookie(idToken, {
  expiresIn: 60 * 60 * 24 * 5 * 1000,
});

const urls = [
  'https://7days-erp.vercel.app/products',
  'https://7days-erp-mzkj.vercel.app/products',
  'http://localhost:3003/products',
];

for (const url of urls) {
  for (let run = 1; run <= 2; run++) {
    const start = performance.now();
    const res = await fetch(url, {
      headers: { Cookie: `session=${sessionCookie}` },
      redirect: 'manual',
    });
    const totalMs = performance.now() - start;
    const middlewareMs = res.headers.get('x-perf-middleware-ms') ?? 'n/a';
    console.log(
      `${url} run${run}: HTTP ${res.status} | total=${totalMs.toFixed(0)} ms | x-perf-middleware-ms=${middlewareMs}`,
    );
  }
}

process.exit(0);
