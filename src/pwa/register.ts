// src/pwa/register.ts
/// <reference types="vite/client" />
//
// Production-only service-worker registration, called once from src/main.ts.
//
// Guards (all mandatory so dev/tests never touch a service worker that only the *build* emits):
//   • import.meta.env.PROD — the SW file (dist/sw.js) is emitted by the build plugin, which runs
//     only for `vite build`. In `vite` (dev) and Vitest there is no /sw.js, so we never register.
//   • navigator.serviceWorker — absent in the Node/jsdom test envs and old browsers.
//   • registration failure is swallowed — offline support is best-effort and must never break
//     app startup.
//
// Note (known project gotcha, unchanged here): the optimizer runs on requestAnimationFrame and is
// THROTTLED by the browser in hidden/background tabs. Installing as a PWA does not change that, and
// this module deliberately adds no background execution — it only makes the app shell load offline.

/** True when this environment can host a service worker (browser with the API present). */
export function serviceWorkerSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

/** Register the production service worker. No-op in dev, in tests, and where unsupported. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return; // dev/test builds emit no sw.js — never register one
  if (!serviceWorkerSupported()) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* best-effort: a registration hiccup must not break startup */
    });
  });
}
