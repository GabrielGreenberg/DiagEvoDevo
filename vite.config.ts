import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { renderServiceWorker } from './src/pwa/serviceWorkerTemplate';

// Single config for both Vite (dev/build) and Vitest (test).
// The math + optimizer modules are pure and run in the fast `node` environment;
// UI tests opt into jsdom per-file via a `// @vitest-environment jsdom` docblock.

// Static app-shell members copied verbatim from public/ (Rollup does not see these, so they must
// be named explicitly). Origin-relative, matching how they are served from the site root.
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
] as const;

// Cheap, dependency-free FNV-1a over the precache list → a stable per-build cache key. The
// fingerprinted JS filename already changes with content, so a content change ⇒ a new version ⇒
// `activate` purges the stale shell. (Avoids pulling in node:crypto types — browser-only hygiene.)
function versionOf(items: readonly string[]): string {
  let h = 0x811c9dc5;
  const s = items.join('\n');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// PWA plugin (build-only): emit dist/sw.js with the real precache manifest of this build's
// fingerprinted assets + the static shell. Absent in dev (`vite`), matching register.ts's PROD
// guard, so the dev server never tries to serve a nonexistent service worker.
function pwaPlugin(): Plugin {
  return {
    name: 'diagram-evolver-pwa',
    apply: 'build',
    generateBundle(_options, bundle) {
      const emitted = Object.keys(bundle).map((f) => '/' + f); // hashed JS/CSS Rollup produced
      const precache = [...new Set([...SHELL, ...emitted])];
      const source = renderServiceWorker({ version: versionOf(precache), precache });
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [pwaPlugin()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
