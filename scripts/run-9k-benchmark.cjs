const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const is2kRun = process.argv.includes('--2k');
const BENCHMARK_TEST_FILE = is2kRun
  ? 'src/lib/import/duplicate/sales-import-2k-real-firebase.benchmark.test.ts'
  : 'src/lib/import/duplicate/sales-import-9k-real-firebase.benchmark.test.ts';

const VITEST_ARGS = [
  '--maxWorkers=1',
  '--fileParallelism=false',
  '--testTimeout=3600000',
  '--hookTimeout=1800000',
];

const BENCHMARK_TEST_BODY = `/** Sole vitest entry for the 9k real-Firebase benchmark. */
import { afterAll, describe, expect, it } from 'vitest';

import {
  runSales9kRealFirebaseBenchmark,
  SALES_9K_ROW_COUNT,
  type Sales9kRealFirebaseBenchmarkReport,
} from './sales-import-performance-audit.helpers';

let report: Sales9kRealFirebaseBenchmarkReport | null = null;

describe.skipIf(process.env.BENCHMARK_RUN_9K !== '1')(
  'Sales import 9k real Firebase benchmark',
  () => {
    it('runs end-to-end against real Firebase', async () => {
      report = await runSales9kRealFirebaseBenchmark();
      expect(report.matchedRows).toBe(SALES_9K_ROW_COUNT);
    }, 3_600_000);
  },
);

afterAll(() => {
  if (!report) return;
  // eslint-disable-next-line no-console
  console.info('\\n[9k Real Firebase Benchmark]', JSON.stringify(report, null, 2));
});
`;

const BENCHMARK_TEST_2K_BODY = `/** Sole vitest entry for the 2k real-Firebase acceptance test. */
import { afterAll, describe, expect, it } from 'vitest';

import {
  runSales2kRealFirebaseBenchmark,
  SALES_2K_ROW_COUNT,
  type Sales2kRealFirebaseBenchmarkReport,
} from './sales-import-performance-audit.helpers';

let report: Sales2kRealFirebaseBenchmarkReport | null = null;

describe.skipIf(process.env.BENCHMARK_RUN_2K !== '1')(
  'Sales import 2k real Firebase acceptance test',
  () => {
    it('runs end-to-end against real Firebase', async () => {
      report = await runSales2kRealFirebaseBenchmark();
      expect(report.matchedRows).toBe(SALES_2K_ROW_COUNT);
      expect(report.pass).toBe(true);
    }, 3_600_000);
  },
);

afterAll(() => {
  if (!report) return;
  // eslint-disable-next-line no-console
  console.info('\\n[2k Real Firebase Acceptance Test]', JSON.stringify(report, null, 2));
});
`;

function readTextFile(filePath) {
  const bytes = fs.readFileSync(filePath);
  if (bytes.length >= 2 && bytes[1] === 0) {
    return bytes.toString('utf16le');
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return bytes.toString('utf8').slice(1);
  }
  return bytes.toString('utf8');
}

function ensureBenchmarkTestFileUtf8() {
  const benchmarkTestPath = path.join(process.cwd(), BENCHMARK_TEST_FILE);
  const body = is2kRun ? BENCHMARK_TEST_2K_BODY : BENCHMARK_TEST_BODY;
  const marker = is2kRun ? 'runSales2kRealFirebaseBenchmark' : 'runSales9kRealFirebaseBenchmark';
  let needsWrite = !fs.existsSync(benchmarkTestPath);
  if (!needsWrite) {
    const bytes = fs.readFileSync(benchmarkTestPath);
    const isUtf16 = bytes.length >= 2 && bytes[1] === 0;
    const text = isUtf16 ? bytes.toString('utf16le') : bytes.toString('utf8');
    needsWrite =
      isUtf16 ||
      !text.includes(marker) ||
      (!is2kRun && text.includes('BENCHMARK_9K_ENABLED'));
  }
  if (needsWrite) {
    fs.mkdirSync(path.dirname(benchmarkTestPath), { recursive: true });
    fs.writeFileSync(benchmarkTestPath, body, 'utf8');
    console.log(`[${is2kRun ? '2k acceptance' : '9k benchmark'}] restored UTF-8 benchmark test file:`, BENCHMARK_TEST_FILE);
  }
}

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('Missing .env.local');
    process.exit(1);
  }
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

function runNodeScript(scriptName, args = []) {
  const result = spawnSync('node', [path.join(__dirname, scriptName), ...args], {
    stdio: 'inherit',
    env: process.env,
    cwd: process.cwd(),
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runVitest(args) {
  const result = spawnSync('npx', ['vitest', ...args], {
    stdio: 'inherit',
    env: process.env,
    shell: true,
    cwd: process.cwd(),
  });
  process.exit(result.status ?? 1);
}

loadEnvLocal();
delete process.env.FIRESTORE_EMULATOR_HOST;
ensureBenchmarkTestFileUtf8();

const validateOnly = process.argv.includes('--validate-only');

if (validateOnly) {
  if (is2kRun) {
    process.env.BENCHMARK_RUN_2K = '1';
    delete process.env.BENCHMARK_RUN_9K;
  } else {
    process.env.BENCHMARK_RUN_9K = '1';
    delete process.env.BENCHMARK_RUN_2K;
    delete process.env.BENCHMARK_9K_SKIP_COMMIT;
    delete process.env.BENCHMARK_9K_SKIP_SEED;
  }

  const label = is2kRun ? '2k acceptance' : '9k benchmark';
  console.log(`[${label}] validate-only: checking prerequisites…`);
  runNodeScript('verify-9k-prereqs.cjs');

  const benchmarkTestPath = path.join(process.cwd(), BENCHMARK_TEST_FILE);
  if (!fs.existsSync(benchmarkTestPath)) {
    console.error(`[${label}] missing dedicated benchmark test file:`, BENCHMARK_TEST_FILE);
    process.exit(1);
  }

  const benchmarkFn = is2kRun ? 'runSales2kRealFirebaseBenchmark' : 'runSales9kRealFirebaseBenchmark';
  let benchmarkCallCount = 0;
  const walkTestFiles = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkTestFiles(full);
        continue;
      }
      if (!entry.name.endsWith('.test.ts')) continue;
      const text = readTextFile(full);
      if (text.includes(benchmarkFn)) {
        benchmarkCallCount += 1;
        console.log(`[${label}] validate-only: found benchmark caller:`, path.relative(process.cwd(), full));
      }
    }
  };
  walkTestFiles(path.join(process.cwd(), 'src'));
  if (benchmarkCallCount !== 1) {
    console.error(`[${label}] expected exactly 1 benchmark test file reference, got`, benchmarkCallCount);
    process.exit(1);
  }

  console.log(`[${label}] validate-only: listing tests in dedicated benchmark file…`);
  runVitest(['list', ...VITEST_ARGS, BENCHMARK_TEST_FILE]);
  process.exit(0);
}

// Full benchmark run
if (is2kRun) {
  delete process.env.BENCHMARK_RUN_9K;
  process.env.BENCHMARK_RUN_2K = '1';
  process.env.BENCHMARK_2K_RUN_ID =
    process.env.BENCHMARK_2K_RUN_ID || `b2k-${Date.now().toString(36)}`;
  console.log('[2k acceptance] runId:', process.env.BENCHMARK_2K_RUN_ID);
  console.log('[2k acceptance] checking prerequisites…');
} else {
  delete process.env.BENCHMARK_2K_SKIP_COMMIT;
  delete process.env.BENCHMARK_9K_SKIP_COMMIT;
  delete process.env.BENCHMARK_9K_SKIP_SEED;
  delete process.env.BENCHMARK_RUN_2K;
  process.env.BENCHMARK_RUN_9K = '1';
  process.env.BENCHMARK_9K_RUN_ID = process.env.BENCHMARK_9K_RUN_ID || 'b9k-final';
  console.log('[9k benchmark] checking prerequisites…');
}
runNodeScript('verify-9k-prereqs.cjs');

const runLabel = is2kRun ? '2k acceptance' : '9k benchmark';
console.log(`[${runLabel}] running single dedicated benchmark file…`);
runVitest(['run', ...VITEST_ARGS, BENCHMARK_TEST_FILE]);
