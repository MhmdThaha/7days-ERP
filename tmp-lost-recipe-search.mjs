/**
 * READ-ONLY: Search all Firestore recipes across every organization.
 * Does NOT write to Firestore.
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

function ingredientText(ing) {
  return (ing.rawMaterialName ?? ing.name ?? '').toLowerCase();
}

function matchesCriteria(recipe) {
  const names = (recipe.ingredients ?? []).map(ingredientText);
  const count = (recipe.ingredients ?? []).length;

  const hasMaida = names.some((n) => n.includes('maida'));
  const hasSugar = names.some((n) => n.includes('sugar'));
  const hasYeast = names.some((n) => n.includes('yeast'));
  const hasBreadImprover = names.some((n) => n.includes('bread improver') || n.includes('improver'));
  const hasMilkEssence = names.some((n) => n.includes('milk essence') || n.includes('essence'));

  const createdAt = recipe.createdAt instanceof Timestamp ? recipe.createdAt.toDate() : null;
  const inWindow =
    createdAt &&
    createdAt >= new Date('2026-07-30T14:00:00.000Z') &&
    createdAt <= new Date('2026-07-30T15:00:00.000Z');

  const reasons = [];
  if (count >= 5) reasons.push('ingredient_count>=5');
  if (hasMaida && hasSugar) reasons.push('maida_and_sugar');
  if (hasYeast) reasons.push('yeast');
  if (hasBreadImprover) reasons.push('bread_improver');
  if (hasMilkEssence) reasons.push('milk_essence');
  if (inWindow) reasons.push('created_2026-07-30T14:00Z_to_15:00Z');

  if (reasons.length === 0) return null;
  return reasons;
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
const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;

// --- Query 1: Full collection group scan (all recipes, all orgs, incl. soft-deleted) ---
const QUERY_1 = {
  description: 'collectionGroup("recipes").get() — all recipe documents in project, no filters',
  collectionGroup: 'recipes',
  filters: 'none (includes soft-deleted; deletedAt may be non-null)',
};

const allRecipesSnap = await db.collectionGroup('recipes').get();

// Build org name cache
const orgIds = new Set();
for (const doc of allRecipesSnap.docs) {
  const orgId = doc.ref.parent.parent?.id;
  if (orgId) orgIds.add(orgId);
}

const orgNames = new Map();
for (const orgId of orgIds) {
  const orgDoc = await db.collection('organizations').doc(orgId).get();
  orgNames.set(orgId, orgDoc.exists ? (orgDoc.data()?.name ?? null) : null);
}

// Build product name cache per org
const productNames = new Map();
for (const doc of allRecipesSnap.docs) {
  const orgId = doc.ref.parent.parent?.id ?? 'unknown';
  const productId = doc.data().productId;
  if (!productId) continue;
  const key = `${orgId}/${productId}`;
  if (productNames.has(key)) continue;
  const prodDoc = await db.collection('organizations').doc(orgId).collection('products').doc(productId).get();
  productNames.set(key, prodDoc.exists ? (prodDoc.data()?.name ?? null) : null);
}

const allRecipes = [];
const matches = [];

for (const doc of allRecipesSnap.docs) {
  const data = doc.data();
  const orgId = doc.ref.parent.parent?.id ?? 'unknown';
  const productId = data.productId ?? null;
  const productKey = productId ? `${orgId}/${productId}` : null;

  const recipe = {
    documentId: doc.id,
    documentPath: doc.ref.path,
    organizationId: orgId,
    organizationName: orgNames.get(orgId) ?? null,
    productId,
    productName: productKey ? (productNames.get(productKey) ?? null) : null,
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
  };

  allRecipes.push(recipe);

  const reasons = matchesCriteria({ ...data, ingredients: data.ingredients ?? [] });
  if (reasons) {
    matches.push({ ...recipe, matchReasons: reasons });
  }
}

// --- Additional targeted queries for proof if zero matches ---
const windowStart = Timestamp.fromDate(new Date('2026-07-30T14:00:00.000Z'));
const windowEnd = Timestamp.fromDate(new Date('2026-07-30T15:00:00.000Z'));

const QUERY_2 = {
  description:
    'collectionGroup("recipes").where("createdAt", ">=", 2026-07-30T14:00:00Z).where("createdAt", "<=", 2026-07-30T15:00:00Z).get()',
  note: 'Requires composite index on collection group recipes + createdAt; falls back to in-memory filter from Query 1 if index missing',
};

let windowQuerySnap = null;
let windowQueryError = null;
try {
  windowQuerySnap = await db
    .collectionGroup('recipes')
    .where('createdAt', '>=', windowStart)
    .where('createdAt', '<=', windowEnd)
    .get();
} catch (err) {
  windowQueryError = err.message;
}

const inWindowFromFullScan = allRecipes.filter((r) => {
  if (!r.createdAt) return false;
  const d = new Date(r.createdAt);
  return d >= new Date('2026-07-30T14:00:00.000Z') && d <= new Date('2026-07-30T15:00:00.000Z');
});

// Summaries for proof
const summary = {
  projectId,
  queriesExecuted: [QUERY_1, QUERY_2],
  query1_totalDocumentsReturned: allRecipesSnap.size,
  query1_totalOrganizationsWithRecipes: orgIds.size,
  query2_indexedQueryResult: windowQuerySnap
    ? { documentCount: windowQuerySnap.size, documentIds: windowQuerySnap.docs.map((d) => d.id) }
    : { error: windowQueryError },
  inWindowFromFullScan: {
    count: inWindowFromFullScan.length,
    recipes: inWindowFromFullScan.map((r) => ({
      documentId: r.documentId,
      organizationId: r.organizationId,
      recipeName: r.recipeName,
      ingredientCount: r.ingredientCount,
      createdAt: r.createdAt,
      deletedAt: r.deletedAt,
    })),
  },
  ingredientCountDistribution: allRecipes.reduce((acc, r) => {
    acc[r.ingredientCount] = (acc[r.ingredientCount] ?? 0) + 1;
    return acc;
  }, {}),
  maxIngredientCountInProject: Math.max(0, ...allRecipes.map((r) => r.ingredientCount)),
  matchCount: matches.length,
  matches,
  allRecipesSummary: allRecipes.map((r) => ({
    documentId: r.documentId,
    organizationId: r.organizationId,
    recipeName: r.recipeName,
    ingredientCount: r.ingredientCount,
    ingredientNames: r.ingredients.map((i) => i.rawMaterialName),
    createdAt: r.createdAt,
    deletedAt: r.deletedAt,
  })),
};

console.log(JSON.stringify(summary, null, 2));
