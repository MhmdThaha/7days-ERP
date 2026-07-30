/**
 * READ-ONLY recovery investigation. Does not write to Firestore.
 */
import { config } from 'dotenv';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

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

function serialize(value) {
  if (value instanceof Timestamp) {
    return {
      _firestoreType: 'Timestamp',
      iso: value.toDate().toISOString(),
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
    };
  }
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = serialize(v);
    return out;
  }
  return value;
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
const deletedId = 'XL2cjS9IkvMAqxUxLnUw';

const deletedRef = db.collection('organizations').doc(orgId).collection('recipes').doc(deletedId);
const deletedSnap = await deletedRef.get();
const deletedRaw = deletedSnap.exists ? deletedSnap.data() : null;

const productSnap = await db
  .collection('organizations')
  .doc(orgId)
  .collection('products')
  .doc(productId)
  .get();

const allForProductSnap = await db
  .collection('organizations')
  .doc(orgId)
  .collection('recipes')
  .where('productId', '==', productId)
  .get();

const allOrgRecipesSnap = await db.collection('organizations').doc(orgId).collection('recipes').get();

const recipesForProduct = allForProductSnap.docs.map((d) => ({
  id: d.id,
  ...serialize(d.data()),
}));

const activeForProduct = recipesForProduct.filter((r) => r.isActive === true && !r.deletedAt);

console.log(
  JSON.stringify(
    {
      step1_deletedRecipe: {
        exists: deletedSnap.exists,
        documentPath: deletedRef.path,
        topLevelFieldNames: deletedRaw ? Object.keys(deletedRaw).sort() : [],
        entireDocument: deletedSnap.exists ? serialize(deletedRaw) : null,
      },
      step5_product: productSnap.exists
        ? { id: productSnap.id, ...serialize(productSnap.data()) }
        : null,
      step5_recipesMatchingProductId: recipesForProduct,
      step5_activeRecipesForProduct: activeForProduct,
      step5_allOrgRecipeSummaries: allOrgRecipesSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          recipeName: data.recipeName,
          productId: data.productId,
          isActive: data.isActive,
          deletedAt: serialize(data.deletedAt),
          createdAt: serialize(data.createdAt),
        };
      }),
    },
    null,
    2,
  ),
);
