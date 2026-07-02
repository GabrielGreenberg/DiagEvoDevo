// src/persistence/prefs.ts
//
// User PREFERENCES persisted to localStorage — currently the per-trajectory step cap (maxSteps).
// Spec (UI feedback pass): the max-steps control must stick through Reset, new seeds, AND page
// reloads; precedence is stored value > config.converge.maxSteps default. The value is written on
// every edit and read once at app start.

import { storage } from './storage';

const MAX_STEPS_KEY = 'diagram-evolver:prefs:maxSteps';

/** The persisted per-trajectory step cap, or null if absent/garbage/unavailable. */
export function loadMaxSteps(): number | null {
  const s = storage();
  if (!s) return null;
  const raw = s.getItem(MAX_STEPS_KEY);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.trunc(n) : null;
}

export function saveMaxSteps(n: number): void {
  if (!Number.isFinite(n) || n < 1) return; // never persist garbage
  storage()?.setItem(MAX_STEPS_KEY, String(Math.trunc(n)));
}

/** Remove the stored cap (tests / explicit "back to default"). */
export function clearMaxSteps(): void {
  storage()?.removeItem(MAX_STEPS_KEY);
}
