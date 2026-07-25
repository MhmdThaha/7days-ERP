/**
 * Vitest stand-in for the "server-only" package, which throws when
 * imported outside a React Server context. Tests import server modules
 * directly, so the marker is replaced with a no-op via vitest.config.ts.
 */

export {};
