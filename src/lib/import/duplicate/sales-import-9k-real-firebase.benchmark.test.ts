/** Sole vitest entry for the 9k real-Firebase benchmark. */
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
  console.info('\n[9k Real Firebase Benchmark]', JSON.stringify(report, null, 2));
});
