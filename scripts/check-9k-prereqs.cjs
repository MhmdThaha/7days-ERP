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
const org = process.env.DEV_ORG_ID || "";
const bad = new Set(["", "your_dev_org_id", "dev-org-id", "org-id", "replace_me"]);
const orgValid = !bad.has(org.trim().toLowerCase()) && org.trim().length >= 8;
console.log(JSON.stringify({ orgValid, orgLen: org.length }));