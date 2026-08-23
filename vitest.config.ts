import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const benchmarkRun9k = process.env.BENCHMARK_RUN_9K === '1';
const benchmarkRun2k = process.env.BENCHMARK_RUN_2K === '1';
const benchmarkRun = benchmarkRun9k || benchmarkRun2k;

export default defineConfig({
  test: {
    environment: 'node',
    include: benchmarkRun
      ? benchmarkRun2k
        ? ['src/lib/import/duplicate/sales-import-2k-real-firebase.benchmark.test.ts']
        : ['src/lib/import/duplicate/sales-import-9k-real-firebase.benchmark.test.ts']
      : ['src/**/*.test.{ts,tsx}'],
    exclude: benchmarkRun ? [] : ['src/**/*.benchmark.test.ts'],
    ...(benchmarkRun
      ? {
          maxWorkers: 1,
          fileParallelism: false,
          testTimeout: 3_600_000,
          hookTimeout: 1_800_000,
          env: benchmarkRun2k
            ? {
                BENCHMARK_RUN_2K: '1',
              }
            : {
                BENCHMARK_RUN_9K: '1',
              },
        }
      : {}),
  },
  resolve: {
    alias: {
      // "server-only" throws outside React Server contexts; tests import
      // server modules directly, so replace it with a no-op stub.
      'server-only': fileURLToPath(new URL('./src/test/server-only-stub.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
