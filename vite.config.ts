import { defineConfig } from 'vitest/config';

// Basis-Pfad: per Env `VITE_BASE` oder CLI `--base=...` ueberschreibbar, Default `/`.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  build: { target: 'es2022' },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/content/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/engine/**'],
      reporter: ['text', 'json-summary'],
      // Gate fuer die Engine (Ist-Stand: Statements 99,8 %, Branches 98,4 %, Functions und Lines 100 %).
      thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
    },
  },
});
