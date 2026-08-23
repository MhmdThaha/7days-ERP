const fs=require("fs");const path=require("path");
for(const line of fs.readFileSync(path.join(process.cwd(),".env.local"),"utf8").split(/\r?\n/)){const t=line.trim();if(!t||t.startsWith("#"))continue;const eq=t.indexOf("=");if(eq===-1)continue;const k=t.slice(0,eq).trim();let v=t.slice(eq+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);process.env[k]=v;}
const {initializeApp,cert,getApps}=require("firebase-admin/app");const {getFirestore}=require("firebase-admin/firestore");
function pk(v){while((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1).trim();return v.replace(/\\n/g,"\n");}
if(!getApps().length){initializeApp({credential:cert({projectId:process.env.FIREBASE_ADMIN_PROJECT_ID,clientEmail:process.env.FIREBASE_ADMIN_CLIENT_EMAIL,privateKey:pk(process.env.FIREBASE_ADMIN_PRIVATE_KEY)}),projectId:process.env.FIREBASE_ADMIN_PROJECT_ID});}
const org=process.env.DEV_ORG_ID;const db=getFirestore();
(async()=>{const hist=await db.collection("organizations").doc(org).collection("importHistory").orderBy("createdAt","desc").limit(5).get();
const rows=hist.docs.map(d=>({id:d.id,fileName:d.data().fileName||null,rowCount:d.data().rowCount,rowsImported:d.data().rowsImported,status:d.data().executionStatus||d.data().status,createdAt:d.data().createdAt?.toDate?.()?.toISOString?.()}));
const sales=await db.collection("organizations").doc(org).collection("sales").where("deletedAt","==",null).count().get();
console.log(JSON.stringify({recentImports:rows,saleCount:sales.data().count},null,2));})();