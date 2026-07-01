import { defineConfig } from 'vitest/config';

// Single config for both Vite (dev/build) and Vitest (test).
// The math + optimizer modules are pure and run in the fast `node` environment;
// UI tests opt into jsdom per-file via a `// @vitest-environment jsdom` docblock.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
