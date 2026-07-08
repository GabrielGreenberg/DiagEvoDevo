// @vitest-environment jsdom
//
// src/pwa/register.test.ts
//
// The critical safety property: dev/test builds emit no /sw.js, so registration must NEVER fire in
// those environments — even when the browser exposes navigator.serviceWorker. Vitest reports
// import.meta.env.PROD === false, so these tests exercise exactly the guard that keeps a nonexistent
// service worker from being registered under `vite` (dev) and the test runner.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { registerServiceWorker, serviceWorkerSupported } from './register';

afterEach(() => {
  // Remove any stub we installed so tests stay independent.
  if (Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')) {
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  }
});

function stubServiceWorker(register: () => Promise<unknown>): void {
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { register },
    configurable: true,
  });
}

describe('serviceWorkerSupported', () => {
  it('is false when navigator lacks a serviceWorker container', () => {
    expect(serviceWorkerSupported()).toBe(false);
  });

  it('is true once the container is present', () => {
    stubServiceWorker(() => Promise.resolve());
    expect(serviceWorkerSupported()).toBe(true);
  });
});

describe('registerServiceWorker', () => {
  it('does not throw in the test environment', () => {
    expect(() => registerServiceWorker()).not.toThrow();
  });

  it('never registers in dev/test even when serviceWorker is available (PROD guard)', () => {
    const register = vi.fn(() => Promise.resolve());
    stubServiceWorker(register);
    registerServiceWorker();
    window.dispatchEvent(new Event('load')); // even if a load listener existed, it must not register
    expect(register).not.toHaveBeenCalled();
  });
});
