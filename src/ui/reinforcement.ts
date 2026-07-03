// src/ui/reinforcement.ts
//
// The REINFORCEMENT mini-panel: controls for how redundant readings are credited by the score
// (a sibling of the Readings strip, above the score panel, same chip semantics):
//   • "matches"     → config.aggregation.matchBonus — independent doubling: several readings
//                     independently tracking a relation raise it (mean-form LSE). Off = only the
//                     best reading counts (softmax-weighted mean). A single toggle chip.
//   • coincidence   → config.bonuses.coincidence {weight, mode} — arranged equality: two readings
//                     the figure makes return the SAME number in the same page units earn a bonus.
//                     A three-state selector (one exclusive chip per setting, CONCEPT §7):
//                       off    ⇒ weight 0 — the term vanishes from the objective
//                       weak   ⇒ default weight, mode 'weak' — same-MAGNITUDE equality (cannot
//                                tell an axis from a collapse)
//                       strong ⇒ default weight, mode 'strong' — same-INK-PATH equality: the two
//                                measurement paths must coincide as ink AND the segment must have
//                                visible extent (kills collapse traps; angle pairs stay weak)
//
// Same pending/live pattern as the Readings chips (carrierStrip.ts): clicks persist immediately
// (persistence/prefs) but bite at the NEXT session only — sessions snapshot their cfg — so while
// a control's next-session state differs from the LIVE session's objective it is marked pending
// and the "applies on Reset" hint shows. The panel never lies about the running objective: the
// live values are read from session.cfg by the caller (app.ts).
//
// Like controls.ts / carrierStrip.ts: mountReinforcement builds the DOM once with one delegated
// listener; updateReinforcement only toggles chip classes.

import { config } from '../config';
import type { CoincidenceSetting } from '../persistence/prefs';

/** The selector's settings in display order (also the exhaustive update loop). */
export const COINCIDENCE_SETTINGS: readonly CoincidenceSetting[] = ['off', 'weak', 'strong'];

export interface ReinforcementState {
  /** The PENDING values (prefs/store) — what the NEXT session will use. */
  pendingMatchBonus: boolean;
  pendingCoincidence: CoincidenceSetting;
  /** The LIVE session's values (its snapshotted cfg) — the RUNNING objective's modes. */
  liveMatchBonus: boolean;
  liveCoincidence: CoincidenceSetting;
}

export interface ReinforcementCallbacks {
  /** Toggle the matches (matchBonus) chip in the pending set. */
  onToggleMatchBonus(): void;
  /** Select a coincidence setting in the pending set (clicking the active one is a no-op there). */
  onSelectCoincidence(mode: CoincidenceSetting): void;
}

const COINCIDENCE_TITLES: Record<CoincidenceSetting, string> = {
  off: 'no coincidence credit — the bonus weight is 0 and the term vanishes from the objective',
  weak: `same-MAGNITUDE coincidence (weight ${config.bonuses.coincidence.weight}) — two readings the figure ARRANGES to return the same number in the same page units earn a bonus; cannot tell an axis (identity by construction) from a collapse (identity by degeneration)`,
  strong: `same-INK-PATH coincidence (weight ${config.bonuses.coincidence.weight}) — readings must ALSO lay their measurement paths on the same ink, and only visible extent counts (kills collapse traps); angle pairs keep the weak formula`,
};

export function mountReinforcement(root: HTMLElement, cb: ReinforcementCallbacks): void {
  const coinChips = COINCIDENCE_SETTINGS.map(
    (m) =>
      `<button class="chip cmode" data-cm="${m}"
        title="${COINCIDENCE_TITLES[m]} — click to select; applies on Reset / new seed">${m}</button>`,
  ).join('');
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
    </div>
    <div class="rgroup">
      <span class="rgname muted">coincidence</span>
      ${coinChips}
    </div>
  </details>`;

  root.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest('.chip') as HTMLElement | null;
    if (!chip) return;
    if (chip.dataset.rk === 'matchBonus') cb.onToggleMatchBonus();
    const cm = chip.dataset.cm;
    if (cm === 'off' || cm === 'weak' || cm === 'strong') cb.onSelectCoincidence(cm);
  });
}

export function updateReinforcement(root: HTMLElement, s: ReinforcementState): void {
  const matches = root.querySelector<HTMLElement>('.chip[data-rk="matchBonus"]');
  if (matches) {
    matches.classList.toggle('off', !s.pendingMatchBonus);
    // pending = this chip's next-session state differs from the LIVE session's objective
    matches.classList.toggle('pending', s.pendingMatchBonus !== s.liveMatchBonus);
  }
  const coinPending = s.pendingCoincidence !== s.liveCoincidence;
  for (const mode of COINCIDENCE_SETTINGS) {
    const chip = root.querySelector<HTMLElement>(`.chip[data-cm="${mode}"]`);
    if (!chip) continue;
    chip.classList.toggle('off', mode !== s.pendingCoincidence); // exclusive: one selected chip
    // pending marks the SELECTED (next-session) setting while it differs from the live objective
    chip.classList.toggle('pending', coinPending && mode === s.pendingCoincidence);
  }
  const hint = root.querySelector<HTMLElement>('[data-r="pending"]');
  if (hint) hint.hidden = s.pendingMatchBonus === s.liveMatchBonus && !coinPending;
}
