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
const org = process.env.DEV_ORG_ID || "probe-org";
const t0 = Date.now();
getFirestore().collectionGroup("hits").where("organizationId","==",org).where("invoiceHash","in",["__benchmark_probe__"]).limit(1).get()
.then(()=>console.log(JSON.stringify({indexOk:true,ms:Date.now()-t0})))
.catch(e=>console.log(JSON.stringify({indexOk:false,ms:Date.now()-t0,err:e.message.slice(0,120)})));