// src/pwa/serviceWorkerTemplate.test.ts
//
// Adversarial tests for the rendered service worker. These pin the SW's invariants without a
// browser: it must be syntactically valid JS, wire exactly the three lifecycle listeners, key its
// cache to the build version, and precache exactly the given shell — including URLs that would
// break a naive string-concatenated template.

import { describe, it, expect } from 'vitest';
import { renderServiceWorker } from './serviceWorkerTemplate';

/** Execute the SW top level under a fake `self`, capturing the listeners it registers. */
function runSW(source: string): Record<string, unknown> {
  const listeners: Record<string, unknown> = {};
  const fakeSelf = {
    addEventListener: (type: string, handler: unknown) => {
      listeners[type] = handler;
    },
    location: { origin: 'https://example.test' },
    skipWaiting: () => undefined,
    clients: { claim: () => undefined },
  };
  new Function('self', source)(fakeSelf);
  return listeners;
}

describe('renderServiceWorker', () => {
  const precache = ['/', '/index.html', '/assets/index-abc123.js', '/icons/icon-192.png'];

  it('produces syntactically valid JS wiring exactly install/activate/fetch', () => {
    const listeners = runSW(renderServiceWorker({ version: 'deadbeef', precache }));
    expect(Object.keys(listeners).sort()).toEqual(['activate', 'fetch', 'install']);
    expect(typeof listeners.install).toBe('function');
    expect(typeof listeners.activate).toBe('function');
    expect(typeof listeners.fetch).toBe('function');
  });

  it('keys the cache to the build version', () => {
    const a = renderServiceWorker({ version: 'v1aaaaaa', precache });
    const b = renderServiceWorker({ version: 'v2bbbbbb', precache });
    expect(a).toContain('diagram-evolver-v1aaaaaa');
    expect(b).toContain('diagram-evolver-v2bbbbbb');
    expect(a).not.toEqual(b); // a version bump changes the emitted SW → activate purges old caches
  });

  it('precaches exactly the provided shell (parsed from the emitted PRECACHE literal)', () => {
    const src = renderServiceWorker({ version: 'x', precache });
    const m = src.match(/const PRECACHE = (\[[^\n]*\]);/);
    expect(m).not.toBeNull();
    expect(JSON.parse(m![1]!)).toEqual(precache);
  });

  it('safely encodes URLs with characters that would break naive concatenation', () => {
    // A quote / backslash in a URL must be JSON-escaped, not injected as code.
    const nasty = ['/a"b', '/c\\d', "/e'f"];
    const src = renderServiceWorker({ version: 'x', precache: nasty });
    const listeners = runSW(src); // must still parse & run
    expect(Object.keys(listeners).sort()).toEqual(['activate', 'fetch', 'install']);
    const m = src.match(/const PRECACHE = (\[[^\n]*\]);/);
    expect(JSON.parse(m![1]!)).toEqual(nasty);
  });

  it('restricts interception to same-origin GET (no cross-origin, no non-GET)', () => {
    const src = renderServiceWorker({ version: 'x', precache });
    expect(src).toContain("req.method !== 'GET'");
    expect(src).toContain('url.origin !== self.location.origin');
    // navigations are network-first, static assets cache-first
    expect(src).toContain("req.mode === 'navigate'");
    expect(src).toContain('caches.match(req)');
  });
});
