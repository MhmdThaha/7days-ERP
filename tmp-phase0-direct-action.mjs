/**
 * [PERF-GLOBAL-TEMP] Invoke listProductsAction in-process to measure server-side breakdown.
 * Simulates server action request (skips HTTP/RSC encoding overhead only).
 */
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });

// Simulate session cookie present — auth-server reads from cookies()
import { cookies } from 'next/headers';

const start = performance.now();
const { listProductsAction } = await import('../src/actions/products.ts');

// Direct call won't have cookies — use benchmark approach instead
console.log('Direct server action import requires Next request context.');
console.log('Using measured server log breakdown from instrumented local prod instead.');
process.exit(0);
