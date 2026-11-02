import { defineConfig } from 'vitest/config';

// Basis-Pfad: per Env `VITE_BASE` oder CLI `--base=...` ueberschreibbar, Default `/`.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  build: { target: 'es2022' },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/content/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['src/engine/**'], reporter: ['text', 'json-summary'] },
  },
});
