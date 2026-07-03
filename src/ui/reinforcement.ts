// src/ui/reinforcement.ts
//
// The REINFORCEMENT mini-panel: two toggle chips controlling how redundant readings are credited
// by the score (a sibling of the Readings strip, above the score panel, same chip semantics):
//   • "matches"     → config.aggregation.matchBonus — independent doubling: several readings
//                     independently tracking a relation raise it (mean-form LSE). Off = only the
//                     best reading counts (softmax-weighted mean).
//   • "coincidence" → config.bonuses.coincidence.weight — arranged equality: two readings the
//                     figure makes return the SAME number in the same page units earn a bonus.
//                     Off ⇒ weight 0 (the term vanishes), on ⇒ the config default weight.
//
// Same pending/live pattern as the Readings chips (carrierStrip.ts): clicks persist immediately
// (persistence/prefs) but bite at the NEXT session only — sessions snapshot their cfg — so while
// a chip's next-session state differs from the LIVE session's objective it is marked pending and
// the "applies on Reset" hint shows. The panel never lies about the running objective: the live
// values are read from session.cfg by the caller (app.ts).
//
// Like controls.ts / carrierStrip.ts: mountReinforcement builds the DOM once with one delegated
// listener; updateReinforcement only toggles chip classes.

import { config } from '../config';

export type ReinforcementKey = 'matchBonus' | 'coincidence';

export interface ReinforcementState {
  /** The PENDING toggle values (prefs/store) — what the NEXT session will use. */
  pendingMatchBonus: boolean;
  pendingCoincidence: boolean;
  /** The LIVE session's values (its snapshotted cfg) — the RUNNING objective's modes. */
  liveMatchBonus: boolean;
  liveCoincidence: boolean;
}

export interface ReinforcementCallbacks {
  /** Toggle one reinforcement mode in the pending set. */
  onToggleReinforcement(key: ReinforcementKey): void;
}

export function mountReinforcement(root: HTMLElement, cb: ReinforcementCallbacks): void {
  root.innerHTML = `<details class="readings reinforce" open>
    <summary>
      <h3>Reinforcement</h3>
      <span class="pendhint" data-r="pending" hidden>pending — applies on Reset / new seed</span>
    </summary>
    <div class="rhint muted">how redundant readings are credited (next session)</div>
    <div class="rgroup">
      <span class="rgname muted">credit</span>
      <button class="chip" data-rk="matchBonus"
        title="independent doubling — several readings independently tracking a relation each raise it (mean-form LSE); off = only the best reading counts — click to toggle; applies on Reset / new seed">matches</button>
      <button class="chip" data-rk="coincidence"
        title="arranged equality — two readings the figure makes return the SAME number in the same page units earn a bonus (weight ${config.bonuses.coincidence.weight}); off = weight 0 — click to toggle; applies on Reset / new seed">coincidence</button>
    </div>
  </details>`;

  root.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest('.chip') as HTMLElement | null;
    const key = chip?.dataset.rk;
    if (key === 'matchBonus' || key === 'coincidence') cb.onToggleReinforcement(key);
  });
}

export function updateReinforcement(root: HTMLElement, s: ReinforcementState): void {
  const set = (key: ReinforcementKey, pending: boolean, live: boolean): void => {
    const chip = root.querySelector<HTMLElement>(`.chip[data-rk="${key}"]`);
    if (!chip) return;
    chip.classList.toggle('off', !pending);
    // pending = this chip's next-session state differs from the LIVE session's objective
    chip.classList.toggle('pending', pending !== live);
  };
  set('matchBonus', s.pendingMatchBonus, s.liveMatchBonus);
  set('coincidence', s.pendingCoincidence, s.liveCoincidence);
  const hint = root.querySelector<HTMLElement>('[data-r="pending"]');
  if (hint) {
    hint.hidden =
      s.pendingMatchBonus === s.liveMatchBonus && s.pendingCoincidence === s.liveCoincidence;
  }
}
