import { config } from 'dotenv';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

config({ path: '.env.local', quiet: true });

function normalizePrivateKey(raw) {
  let key = (raw ?? '').trim();
  while ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  if (key.endsWith(',')) key = key.slice(0, -1).trim();
  if (key.endsWith('"') || key.endsWith("'")) key = key.slice(0, -1).trim();
  if (key.startsWith('"') || key.startsWith("'")) key = key.slice(1).trim();
  return key.replace(/\\n/g, '\n').trim();
}

function ts(v) {
  return v instanceof Timestamp ? v.toDate().toISOString() : null;
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
const doc = await db
  .collection('organizations')
  .doc('mu71xTRXs9MubZgbAuGE')
  .collection('recipes')
  .doc('XL2cjS9IkvMAqxUxLnUw')
  .get();

console.log(JSON.stringify({ exists: doc.exists, data: doc.exists ? { ...doc.data(), createdAt: ts(doc.data().createdAt), updatedAt: ts(doc.data().updatedAt), deletedAt: ts(doc.data().deletedAt) } : null }, null, 2));
