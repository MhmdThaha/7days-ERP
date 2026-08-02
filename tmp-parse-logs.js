const fs = require('fs');
const file = process.argv[2];
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim().startsWith('{'));
const seen = new Set();
const rows = [];
for (const l of lines) {
  let j;
  try { j = JSON.parse(l); } catch { continue; }
  if (seen.has(j.id)) continue;
  seen.add(j.id);
  const nested = (j.logs || []).map((x) => x.message).join(' ') || j.message || '';
  let cookie = '', decision = '';
  const m = nested.match(/hasSessionCookie":(\w+),"decision":"(\w+)"/);
  if (m) { cookie = m[1]; decision = m[2]; }
  rows.push({
    ts: j.timestamp,
    line: new Date(j.timestamp).toISOString() + ' ' + (j.domain || '?') + ' ' + (j.requestMethod || '-') + ' ' + (j.requestPath || '-') + ' ' + (j.responseStatusCode || '-') + ' cookie=' + cookie + ' decision=' + decision,
  });
}
rows.sort((a, b) => a.ts - b.ts);
console.log('unique requests:', rows.length);
rows.forEach((r) => console.log(r.line));
