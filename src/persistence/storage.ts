// src/persistence/storage.ts
//
// The single guarded gateway to localStorage, shared by results (store.ts) and preferences
// (prefs.ts). Some DOM shims (e.g. jsdom without a URL origin) expose a `localStorage` object
// whose Storage methods are missing — treat that as "no storage" so persistence degrades to a
// no-op instead of throwing.

export function storage(): Storage | null {
  try {
    if (
      typeof localStorage !== 'undefined' &&
      typeof localStorage.getItem === 'function' &&
      typeof localStorage.setItem === 'function' &&
      typeof localStorage.removeItem === 'function'
    ) {
      return localStorage;
    }
    return null;
  } catch {
    return null;
  }
}
