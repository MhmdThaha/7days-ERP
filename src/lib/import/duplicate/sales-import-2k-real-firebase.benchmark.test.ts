/** Sole vitest entry for the 2k real-Firebase acceptance test. */
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
  console.info('\n[2k Real Firebase Acceptance Test]', JSON.stringify(report, null, 2));
});
