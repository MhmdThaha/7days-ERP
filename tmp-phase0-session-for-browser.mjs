/**
 * [PERF-GLOBAL-TEMP] Phase 0: mint session cookie for browser baseline (stdout only).
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
const sessionCookie = await auth.createSessionCookie(idToken, {
  expiresIn: 60 * 60 * 24 * 5 * 1000,
});

// Single JSON line for tooling — do not log elsewhere
console.log(JSON.stringify({ sessionCookie, uid }));
