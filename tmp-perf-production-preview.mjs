/**
 * [PERF-INVESTIGATION] Production material preview pipeline — timing only.
 * Measures Firestore reads (admin SDK) + optional HTTP server actions.
 */
import { config } from 'dotenv';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

config({ path: '.env.local', quiet: true });

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

const auth = getAuth();
const db = getFirestore();
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const uid = 'a3B2rvSFoRToKzGg7gLahDIbCs63';
const BASE = process.env.PREVIEW_PERF_BASE ?? 'http://localhost:3000';

function mark(stages, name, start, extra = {}) {
  const end = performance.now();
  const row = {
    stage: name,
    startMs: start.toFixed(1),
    endMs: end.toFixed(1),
    durationMs: +(end - start).toFixed(1),
    ...extra,
  };
  stages.push(row);
  console.log(
    `[${row.durationMs.toFixed(0).padStart(5)} ms] ${name}` +
      (extra.firestoreReads ? ` | FS reads: ${extra.firestoreReads}` : '') +
      (extra.records != null ? ` | records: ${extra.records}` : '') +
      (extra.cache ? ` | ${extra.cache}` : ''),
  );
  return end;
}

async function getSessionCookie() {
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
  const sessionRes = await fetch(`${BASE}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  const setCookie = sessionRes.headers.get('set-cookie') ?? '';
  const m = setCookie.match(/session=([^;]+)/);
  return m?.[1] ?? '';
}

async function callServerAction(pagePath, actionName, args, cookie) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}${pagePath}`, {
    method: 'POST',
    headers: {
      Cookie: `session=${cookie}`,
      'Content-Type': 'text/plain;charset=UTF-8',
      'Next-Action': actionName,
      Accept: 'text/x-component',
    },
    body: JSON.stringify(args),
  });
  const body = await res.text();
  return {
    durationMs: performance.now() - t0,
    status: res.status,
    ok: res.ok,
    bodyLength: body.length,
  };
}

async function firestorePipeline(orgId) {
  const stages = [];
  const t0 = performance.now();
  console.log('\n=== FIRESTORE-ONLY (Admin SDK, cold reads) ===\n');

  // Find a product with activeRecipeId
  let t = t0;
  const productsSnap = await db.collection(`organizations/${orgId}/products`).where('deletedAt', '==', null).limit(50).get();
  t = mark(stages, '1. Product list scan (picker sim)', t, {
    firestoreReads: productsSnap.size,
    records: productsSnap.size,
    cache: 'network',
  });

  const productDoc = productsSnap.docs.find((d) => d.data().activeRecipeId && d.data().isActive);
  if (!productDoc) {
    console.log('No product with activeRecipeId found — aborting Firestore pipeline');
    return stages;
  }
  const productId = productDoc.id;
  const activeRecipeId = productDoc.data().activeRecipeId;

  t = performance.now();
  const productGet = await db.doc(`organizations/${orgId}/products/${productId}`).get();
  mark(stages, '2. Product getById (useProductsByIds)', t, {
    firestoreReads: 1,
    records: 1,
    cache: productGet.metadata?.fromCache ? 'cache' : 'network',
  });

  t = performance.now();
  const recipeGet = await db.doc(`organizations/${orgId}/recipes/${activeRecipeId}`).get();
  const recipeData = recipeGet.data();
  const ingredientCount = recipeData?.ingredients?.length ?? 0;
  mark(stages, '3. Recipe getById (production-full)', t, {
    firestoreReads: 1,
    records: 1,
    cache: recipeGet.metadata?.fromCache ? 'cache' : 'network',
  });

  t = performance.now();
  const ingredients = recipeData?.ingredients ?? [];
  const rmResults = await Promise.all(
    ingredients.map((ing) =>
      db.doc(`organizations/${orgId}/rawMaterials/${ing.rawMaterialId}`).get(),
    ),
  );
  mark(stages, '4. Raw material getById x N (parallel)', t, {
    firestoreReads: ingredients.length,
    records: ingredients.length,
    cache: 'network (parallel)',
  });

  // Recipe list for picker (full collection — matches recipe.repository.list)
  t = performance.now();
  const allRecipesSnap = await db.collection(`organizations/${orgId}/recipes`).where('deletedAt', '==', null).get();
  mark(stages, '0. Recipe list (page load, production-picker)', t, {
    firestoreReads: allRecipesSnap.size,
    records: allRecipesSnap.size,
    cache: 'network',
  });

  // Simulated waterfall (sequential stages as React Query enables them)
  const waterfallStart = performance.now();
  await db.doc(`organizations/${orgId}/products/${productId}`).get();
  const afterProduct = performance.now();
  await db.doc(`organizations/${orgId}/recipes/${activeRecipeId}`).get();
  const afterRecipe = performance.now();
  await Promise.all(
    ingredients.map((ing) =>
      db.doc(`organizations/${orgId}/rawMaterials/${ing.rawMaterialId}`).get(),
    ),
  );
  const afterRm = performance.now();

  stages.push({
    stage: 'WATERFALL sequential (product→recipe→materials)',
    durationMs: +(afterRm - waterfallStart).toFixed(1),
    productStageMs: +(afterProduct - waterfallStart).toFixed(1),
    recipeStageMs: +(afterRecipe - afterProduct).toFixed(1),
    materialsStageMs: +(afterRm - afterRecipe).toFixed(1),
    firestoreReads: 1 + 1 + ingredients.length,
    records: 2 + ingredients.length,
  });
  console.log(
    `[${(afterRm - waterfallStart).toFixed(0).padStart(5)} ms] WATERFALL sequential | product: ${(afterProduct - waterfallStart).toFixed(0)} + recipe: ${(afterRecipe - afterProduct).toFixed(0)} + materials: ${(afterRm - afterRecipe).toFixed(0)} ms`,
  );

  mark(stages, '5. buildMaterialPreview (CPU sim skipped — <1ms typical)', performance.now(), {
    records: ingredientCount,
    cache: 'n/a',
  });

  console.log(`\n  Firestore pipeline TOTAL: ${(performance.now() - t0).toFixed(0)} ms`);
  return stages;
}

async function httpPipeline(cookie) {
  console.log('\n=== HTTP SERVER ACTIONS (includes auth per request) ===\n');
  const stages = [];

  // Warm: list recipes (page load)
  let r = await callServerAction('/production/new', 'listRecipesAction', [{ status: 'active', page: 1, pageSize: 100 }], cookie);
  console.log(`[${r.durationMs.toFixed(0).padStart(5)} ms] listRecipesAction (page load) HTTP ${r.status}`);

  // Need product id — use Firestore
  const userDoc = await db.collection('users').doc(uid).get();
  const orgId = userDoc.data()?.organizationId;
  const productsSnap = await db.collection(`organizations/${orgId}/products`).where('deletedAt', '==', null).limit(50).get();
  const productDoc = productsSnap.docs.find((d) => d.data().activeRecipeId);
  if (!productDoc) return;
  const productId = productDoc.id;
  const recipeId = productDoc.data().activeRecipeId;
  const recipeSnap = await db.doc(`organizations/${orgId}/recipes/${recipeId}`).get();
  const ingredients = recipeSnap.data()?.ingredients ?? [];

  const wfStart = performance.now();

  r = await callServerAction('/production/new', 'getProductAction', [productId], cookie);
  const tAfterProduct = performance.now();
  console.log(`[${r.durationMs.toFixed(0).padStart(5)} ms] getProductAction (cold) HTTP ${r.status}`);

  r = await callServerAction('/production/new', 'getProductAction', [productId], cookie);
  console.log(`[${r.durationMs.toFixed(0).padStart(5)} ms] getProductAction (repeat — sim duplicate) HTTP ${r.status}`);

  r = await callServerAction('/production/new', 'getRecipeAction', [recipeId], cookie);
  const tAfterRecipe = performance.now();
  console.log(`[${r.durationMs.toFixed(0).padStart(5)} ms] getRecipeAction HTTP ${r.status}`);

  const rmStart = performance.now();
  for (const ing of ingredients) {
    const rr = await callServerAction('/production/new', 'getRawMaterialAction', [ing.rawMaterialId], cookie);
    console.log(`[${rr.durationMs.toFixed(0).padStart(5)} ms] getRawMaterialAction ${ing.rawMaterialId.slice(0, 8)}… HTTP ${rr.status}`);
  }
  const tAfterRm = performance.now();

  console.log(
    `\n  HTTP WATERFALL TOTAL: ${(tAfterRm - wfStart).toFixed(0)} ms (product→recipe→${ingredients.length}x material sequential actions)`,
  );

  // Parallel materials (what useQueries does)
  const parStart = performance.now();
  await Promise.all(
    ingredients.map((ing) =>
      callServerAction('/production/new', 'getRawMaterialAction', [ing.rawMaterialId], cookie),
    ),
  );
  console.log(`  HTTP parallel materials only: ${(performance.now() - parStart).toFixed(0)} ms`);

  return stages;
}

async function main() {
  const userDoc = await db.collection('users').doc(uid).get();
  const orgId = userDoc.data()?.organizationId;
  if (!orgId) {
    console.error('No orgId for test user');
    process.exit(1);
  }
  console.log(`Org: ${orgId}`);

  await firestorePipeline(orgId);

  try {
    const cookie = await getSessionCookie();
    if (cookie) await httpPipeline(cookie);
    else console.log('\nSkipping HTTP pipeline — no session cookie');
  } catch (e) {
    console.log('\nHTTP pipeline failed:', e.message);
  }
}

main().then(() => process.exit(0));
