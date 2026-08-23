const fs = require("fs");
const path = require("path");
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  let val = trimmed.slice(eq + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
  process.env[key] = val;
}
delete process.env.FIRESTORE_EMULATOR_HOST;
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
function pk(v){while((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1).trim();return v.replace(/\\n/g,"\n");}
if(!getApps().length){initializeApp({credential:cert({projectId:process.env.FIREBASE_ADMIN_PROJECT_ID,clientEmail:process.env.FIREBASE_ADMIN_CLIENT_EMAIL,privateKey:pk(process.env.FIREBASE_ADMIN_PRIVATE_KEY)}),projectId:process.env.FIREBASE_ADMIN_PROJECT_ID});}
const org = process.env.DEV_ORG_ID || "";
const bad = new Set(["", "your_dev_org_id", "dev-org-id", "org-id", "replace_me"]);
const orgIdValid = !bad.has(org.trim().toLowerCase()) && org.trim().length >= 8;
(async () => {
  const out = { orgIdValid, orgLen: org.length, orgExists: false, indexOk: false, indexMs: 0, productCount: 0 };
  if (!orgIdValid) { console.log(JSON.stringify(out)); return; }
  const db = getFirestore();
  const orgSnap = await db.collection("organizations").doc(org).get();
  out.orgExists = orgSnap.exists;
  if (orgSnap.exists) {
    const prodSnap = await db.collection("organizations").doc(org).collection("products").where("deletedAt","==",null).limit(1).get();
    out.productCount = prodSnap.size > 0 ? "some" : 0;
    const fullProd = await db.collection("organizations").doc(org).collection("products").where("deletedAt","==",null).get();
    out.productCount = fullProd.size;
  }
  const t0 = Date.now();
  try {
    await db.collectionGroup("hits").where("organizationId","==",org).where("invoiceHash","in",["__benchmark_probe__"]).limit(1).get();
    out.indexOk = true;
    out.indexMs = Date.now() - t0;
  } catch (e) {
    out.indexOk = false;
    out.indexMs = Date.now() - t0;
    out.indexError = e.message.slice(0, 200);
  }
  out.ok = orgIdValid && out.orgExists && out.indexOk && out.productCount > 0;
  if (process.argv.includes('--check-run')) {
    const runId = process.env.CHECK_RUN_ID || '';
    const prefix = `B2K-${runId}`;
    const histSnap = await db.collection('organizations').doc(org).collection('importHistory')
      .orderBy('createdAt', 'desc').limit(8).get();
    const recent = histSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        status: data.status,
        rowCount: data.rowCount,
        rowsImported: data.rowsImported,
        rowsSkipped: data.rowsSkipped,
        duplicateIndexStatus: data.duplicateIndexStatus ?? null,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
      };
    });
    const salesSnap = await db.collection('organizations').doc(org).collection('sales')
      .where('saleNumber', '>=', prefix).where('saleNumber', '<=', `${prefix}\uf8ff`).get();
    out.runCheck = {
      runId,
      prefix,
      recentImportHistory: recent,
      salesForRun: salesSnap.size,
      sampleSaleNumbers: salesSnap.docs.slice(0, 5).map((doc) => doc.data().saleNumber),
    };
  }
  console.log(JSON.stringify(out));
})();