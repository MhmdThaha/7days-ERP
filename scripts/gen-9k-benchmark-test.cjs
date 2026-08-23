const fs = require("node:fs");
const path = require("node:path");
const target = path.join(__dirname, "../src/lib/import/duplicate/sales-import-9k-real-firebase.benchmark.test.ts");
fs.writeFileSync(target, fs.readFileSync(path.join(__dirname, "sales-import-9k-benchmark.test.body.ts"), "utf8"), "utf8");
console.log("ok", fs.statSync(target).size);