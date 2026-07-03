// src/persistence/prefs.ts
//
// User PREFERENCES persisted to localStorage — the per-trajectory step cap (maxSteps), the
// convergence strictness (plateauRelEps), the disabled-readings set (carrier toggles), and the
// reinforcement toggles (matchBonus / coincidence). Spec (UI feedback passes): all controls must
// stick through Reset, new seeds, AND page reloads; precedence is stored value > config default.
// Values are written on every edit and read once at app start.

import { storage } from './storage';

const MAX_STEPS_KEY = 'diagram-evolver:prefs:maxSteps';
const PLATEAU_REL_EPS_KEY = 'diagram-evolver:prefs:plateauRelEps';
const DISABLED_CARRIERS_KEY = 'diagram-evolver:prefs:disabledCarriers';
const MATCH_BONUS_KEY = 'diagram-evolver:prefs:matchBonus';
const COINCIDENCE_KEY = 'diagram-evolver:prefs:coincidence';

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

/** The persisted disabled-readings set (canonical distinct-carrier ids, deduped), or null if
 *  absent/garbage/unavailable. Garbage = anything but a JSON array of strings. */
export function loadDisabledCarriers(): string[] | null {
  const s = storage();
  if (!s) return null;
  const raw = s.getItem(DISABLED_CARRIERS_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((x): x is string => typeof x === 'string')) {
      return null;
    }
    return [...new Set(parsed)];
  } catch {
    return null;
  }
}

export function saveDisabledCarriers(ids: readonly string[]): void {
  if (!Array.isArray(ids) || !ids.every((x) => typeof x === 'string')) return; // never persist garbage
  storage()?.setItem(DISABLED_CARRIERS_KEY, JSON.stringify([...new Set(ids)]));
}

/** Remove the stored set (tests / explicit "back to default": everything on). */
export function clearDisabledCarriers(): void {
  storage()?.removeItem(DISABLED_CARRIERS_KEY);
}

// ── Reinforcement toggles (matchBonus / coincidence) — boolean prefs, same pattern ────────────
// Semantics live in src/config.ts: matchBonus → config.aggregation.matchBonus; coincidence →
// config.bonuses.coincidence.weight (off ⇒ 0, on ⇒ the config default). Like the carrier toggles
// they persist immediately but bite at the NEXT session (sessions snapshot their cfg).

/** Shared boolean-pref reader: exactly 'true'/'false' round-trip; anything else is garbage → null
 *  (caller falls back to the config default). */
function loadBool(key: string): boolean | null {
  const raw = storage()?.getItem(key) ?? null;
  return raw === 'true' ? true : raw === 'false' ? false : null;
}

/** The persisted matchBonus toggle (independent-doubling credit), or null if absent/garbage. */
export function loadMatchBonus(): boolean | null {
  return loadBool(MATCH_BONUS_KEY);
}

export function saveMatchBonus(on: boolean): void {
  if (typeof on !== 'boolean') return; // never persist garbage
  storage()?.setItem(MATCH_BONUS_KEY, String(on));
}

/** Remove the stored toggle (tests / explicit "back to default"). */
export function clearMatchBonus(): void {
  storage()?.removeItem(MATCH_BONUS_KEY);
}

/** The persisted coincidence toggle (arranged-equality bonus), or null if absent/garbage. */
export function loadCoincidence(): boolean | null {
  return loadBool(COINCIDENCE_KEY);
}

export function saveCoincidence(on: boolean): void {
  if (typeof on !== 'boolean') return; // never persist garbage
  storage()?.setItem(COINCIDENCE_KEY, String(on));
}

/** Remove the stored toggle (tests / explicit "back to default"). */
export function clearCoincidence(): void {
  storage()?.removeItem(COINCIDENCE_KEY);
}
