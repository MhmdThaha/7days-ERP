/**
 * READ-ONLY: global recipe search — time window + ingredient filters.
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

function tsIso(v) {
  if (!v) return null;
  if (v instanceof Timestamp) return v.toDate().toISOString();
  return String(v);
}

function ingredientNames(data) {
  return (data.ingredients ?? []).map((ing) =>
    String(ing.rawMaterialName ?? ing.name ?? '').toLowerCase(),
  );
}

function hasIngredient(names, pattern) {
  return names.some((n) => n.includes(pattern));
}

const REQUIRED_INGREDIENTS = [
  { key: 'maida', pattern: 'maida' },
  { key: 'sugar', pattern: 'sugar' },
  { key: 'salt', pattern: 'salt' },
  { key: 'yeast', pattern: 'yeast' },
  { key: 'water', pattern: 'water' },
  { key: 'bread_improver', pattern: 'bread improver' },
  { key: 'milk_essence', pattern: 'milk essence' },
];

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
const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const windowStart = new Date('2026-07-30T08:30:00.000Z');
const windowEnd = new Date('2026-07-30T09:30:00.000Z');

const QUERY = {
  description: 'collectionGroup("recipes").get() — all recipes, all orgs, incl. soft-deleted',
  projectId,
  timeWindowUtc: { start: windowStart.toISOString(), end: windowEnd.toISOString() },
  timeWindowIst: { start: '2026-07-30T14:00:00+05:30', end: '2026-07-30T15:00:00+05:30' },
};

const allSnap = await db.collectionGroup('recipes').get();

const orgIds = new Set();
for (const doc of allSnap.docs) {
  const orgId = doc.ref.parent.parent?.id;
  if (orgId) orgIds.add(orgId);
}

const orgNames = new Map();
for (const orgId of orgIds) {
  const orgDoc = await db.collection('organizations').doc(orgId).get();
  orgNames.set(orgId, orgDoc.exists ? (orgDoc.data()?.name ?? null) : null);
}

const productNames = new Map();
async function getProductName(orgId, productId) {
  if (!productId) return null;
  const key = `${orgId}/${productId}`;
  if (productNames.has(key)) return productNames.get(key);
  const prodDoc = await db.collection('organizations').doc(orgId).collection('products').doc(productId).get();
  const name = prodDoc.exists ? (prodDoc.data()?.name ?? null) : null;
  productNames.set(key, name);
  return name;
}

function formatRecipe(doc) {
  const data = doc.data();
  const orgId = doc.ref.parent.parent?.id ?? 'unknown';
  const names = ingredientNames(data);
  const ingredientMatches = Object.fromEntries(
    REQUIRED_INGREDIENTS.map(({ key, pattern }) => [key, hasIngredient(names, pattern)]),
  );
  const matchesAllRequired = REQUIRED_INGREDIENTS.every(({ pattern }) => hasIngredient(names, pattern));

  const createdAtDate =
    data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt ? new Date(data.createdAt) : null;

  const inWindow =
    createdAtDate && createdAtDate >= windowStart && createdAtDate <= windowEnd;

  return {
    documentId: doc.id,
    documentPath: doc.ref.path,
    organizationId: orgId,
    organizationName: orgNames.get(orgId) ?? null,
    productId: data.productId ?? null,
    productName: null,
    recipeName: data.recipeName ?? null,
    recipeCode: data.recipeCode ?? null,
    ingredientCount: (data.ingredients ?? []).length,
    ingredients: (data.ingredients ?? []).map((ing) => ({
      rawMaterialId: ing.rawMaterialId ?? null,
      rawMaterialName: ing.rawMaterialName ?? ing.name ?? null,
      quantity: ing.quantity ?? null,
      unit: ing.unit ?? null,
    })),
    createdAt: tsIso(data.createdAt),
    updatedAt: tsIso(data.updatedAt),
    deletedAt: tsIso(data.deletedAt),
    deletedBy: data.deletedBy ?? null,
    isActive: data.isActive ?? null,
    createdBy: data.createdBy ?? null,
    inTimeWindow: inWindow,
    ingredientMatches,
    matchesAllRequiredIngredients: matchesAllRequired,
  };
}

const allRecipes = [];
for (const doc of allSnap.docs) {
  allRecipes.push(formatRecipe(doc));
}

for (const r of allRecipes) {
  r.productName = await getProductName(r.organizationId, r.productId);
}

const inWindow = allRecipes.filter((r) => r.inTimeWindow);
const ingredientMatches = allRecipes.filter((r) =>
  REQUIRED_INGREDIENTS.some(({ pattern }) =>
    r.ingredients.some((ing) =>
      String(ing.rawMaterialName ?? '').toLowerCase().includes(pattern),
    ),
  ),
);
const matchesAllSeven = allRecipes.filter((r) => r.matchesAllRequiredIngredients);

console.log(
  JSON.stringify(
    {
      query: QUERY,
      totalRecipesInProject: allSnap.size,
      totalOrganizations: orgIds.size,
      recipesInTimeWindow: {
        count: inWindow.length,
        documents: inWindow,
      },
      recipesMatchingAnyListedIngredient: {
        count: ingredientMatches.length,
        documents: ingredientMatches,
      },
      recipesMatchingAllSevenIngredients: {
        count: matchesAllSeven.length,
        documents: matchesAllSeven,
      },
    },
    null,
    2,
  ),
);
