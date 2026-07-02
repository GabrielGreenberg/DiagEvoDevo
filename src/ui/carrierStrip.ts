// src/ui/carrierStrip.ts
//
// The READINGS strip (carrier-toggle dashboard): one small toggle chip per DISTINCT carrier under
// the configured geometry (registry.allCarriers — the unfiltered set, so an off reading stays
// listed and can be turned back on), plain-English labels, grouped visually
// (start · mid · end · displacement · angles).
//
// Semantics (exploration knob, see config.carriers):
//   • clicking a chip toggles the reading in the PENDING disabled set, which PERSISTS in
//     localStorage (persistence/prefs.loadDisabledCarriers — same pattern as maxSteps);
//   • toggles take effect at the NEXT session (Reset / new seed): sessions snapshot their cfg at
//     construction, so a live session keeps its objective. While the pending set differs from the
//     LIVE session's (session.cfg.carriers.disabled), a subtle "applies on Reset" hint shows and
//     the differing chips are marked pending.
//
// Like controls.ts: mountCarrierStrip builds the DOM once with one delegated listener;
// updateCarrierStrip only toggles chip state/classes so per-notify renders never rebuild the strip.

import { config } from '../config';
import { allCarriers, type Carrier } from '../core/measurements/registry';

export interface CarrierStripState {
  /** The PENDING disabled ids (prefs/store) — what the NEXT session will exclude. */
  pendingDisabled: ReadonlySet<string>;
  /** The LIVE session's disabled ids (its snapshotted cfg) — the RUNNING objective's exclusions. */
  liveDisabled: ReadonlySet<string>;
}

export interface CarrierStripCallbacks {
  /** Toggle one distinct carrier (by canonical id) in the pending disabled set. */
  onToggleCarrier(id: string): void;
}

/** Display groups, in order. Angles are grouped by unit class; points by their part. */
const GROUP_ORDER = ['start', 'mid', 'end', 'displacement', 'angles'] as const;
type GroupName = (typeof GROUP_ORDER)[number];

function groupOf(c: Carrier): GroupName {
  if (c.unitClass === 'angle') return 'angles';
  const part = c.measurement.part;
  if (part === 'displacement') return 'displacement';
  return part === 'midpoint' ? 'mid' : part; // 'start' | 'end'
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function mountCarrierStrip(root: HTMLElement, cb: CarrierStripCallbacks): void {
  // The distinct-carrier set of the app's configured geometry, UNFILTERED (chips must list
  // disabled readings too). The geometry is fixed per app run, so this is computed once.
  const groups = new Map<GroupName, Carrier[]>(GROUP_ORDER.map((g) => [g, []]));
  for (const c of allCarriers(config)) groups.get(groupOf(c))!.push(c);

  const groupHtml = GROUP_ORDER.map((g) => {
    const chips = groups
      .get(g)!
      .map(
        (c) =>
          `<button class="chip" data-cid="${esc(c.id)}"
            title="${esc(c.id)}${c.aliases.length ? ` (also ${c.aliases.map(esc).join(', ')})` : ''} — click to toggle; applies on Reset / new seed">${esc(c.label)}</button>`,
      )
      .join('');
    return `<div class="rgroup"><span class="rgname muted">${g}</span>${chips}</div>`;
  }).join('');

  root.innerHTML = `<details class="readings" open>
    <summary>
      <h3>Readings <span class="muted" data-r="count"></span></h3>
      <span class="pendhint" data-r="pending" hidden>pending — applies on Reset / new seed</span>
    </summary>
    <div class="rhint muted">click a reading to exclude it from the census (next session): candidate sets, LSE means, and data-ink all follow</div>
    ${groupHtml}
  </details>`;

  root.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest('.chip') as HTMLElement | null;
    if (!chip || !chip.dataset.cid) return;
    cb.onToggleCarrier(chip.dataset.cid);
  });
}

export function updateCarrierStrip(root: HTMLElement, s: CarrierStripState): void {
  const chips = root.querySelectorAll<HTMLElement>('.chip');
  let on = 0;
  for (const chip of chips) {
    const id = chip.dataset.cid!;
    const off = s.pendingDisabled.has(id);
    if (!off) on += 1;
    chip.classList.toggle('off', off);
    // pending = this chip's next-session state differs from the LIVE session's objective
    chip.classList.toggle('pending', off !== s.liveDisabled.has(id));
  }
  const count = root.querySelector<HTMLElement>('[data-r="count"]');
  if (count) count.textContent = `${on}/${chips.length} on`;
  const pending = root.querySelector<HTMLElement>('[data-r="pending"]');
  if (pending) pending.hidden = setsEqual(s.pendingDisabled, s.liveDisabled);
}

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
