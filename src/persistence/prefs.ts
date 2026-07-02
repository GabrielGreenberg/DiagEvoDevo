// src/persistence/prefs.ts
//
// User PREFERENCES persisted to localStorage — the per-trajectory step cap (maxSteps) and the
// convergence strictness (plateauRelEps). Spec (UI feedback passes): both controls must stick
// through Reset, new seeds, AND page reloads; precedence is stored value > config default. Values
// are written on every edit and read once at app start.

import { storage } from './storage';

const MAX_STEPS_KEY = 'diagram-evolver:prefs:maxSteps';
const PLATEAU_REL_EPS_KEY = 'diagram-evolver:prefs:plateauRelEps';

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

/** The persisted convergence strictness (plateauRelEps), or null if absent/garbage/unavailable.
 *  Must be a finite POSITIVE number — the relative-spread threshold is meaningless at ≤ 0. */
export function loadPlateauRelEps(): number | null {
  const s = storage();
  if (!s) return null;
  const raw = s.getItem(PLATEAU_REL_EPS_KEY);
  if (raw === null) return null;
  const x = Number(raw);
  return Number.isFinite(x) && x > 0 ? x : null;
}

export function savePlateauRelEps(x: number): void {
  if (!Number.isFinite(x) || x <= 0) return; // never persist garbage
  storage()?.setItem(PLATEAU_REL_EPS_KEY, String(x));
}

/** Remove the stored strictness (tests / explicit "back to default"). */
export function clearPlateauRelEps(): void {
  storage()?.removeItem(PLATEAU_REL_EPS_KEY);
}
