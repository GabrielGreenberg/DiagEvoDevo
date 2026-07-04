// @vitest-environment jsdom
//
// src/ui/app.test.ts — the wired app against a CONTRACT fake session (./fixtures), centered on the
// sticky-selection/gallery/persistence pass:
//   • STICKY SELECTION (adversarial): the displayed trajectory NEVER auto-switches — not when
//     another trajectory's score overtakes, not when the selected one finishes and its slot
//     restarts. It changes only on a user thumbnail click.
//   • GALLERY: every trajectory ever started stays visible (endpoints frozen, never dropped).
//   • PERSISTENT RESULTS: nothing clears at 'done'.
//   • PERSISTENT maxSteps: localStorage round-trip across Reset AND a fresh startApp ("reload").
//   • Save persists the SELECTED trajectory, not best().
// (Canvas 2D is unavailable in jsdom; drawing is skipped, DOM structure is not.)

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { startApp } from './app';
import { config, type Config } from '../config';
import { seedToDataSet } from '../core/data';
import { seedToFigure } from '../core/figure';
import { loudGoldenBarChart } from '../core/fixtures';
import { scoreExact } from '../core/score';
import { allCarriers } from '../core/measurements/registry';
import { REFERENCE_ID } from './reference';
import { makeFakeSession, type FakeSession, type FakeSessionOptions } from './fixtures';
import { clearResults } from '../persistence/store';
import {
  clearMaxSteps,
  clearPlateauRelEps,
  clearDisabledCarriers,
  loadDisabledCarriers,
  clearMatchBonus,
  clearCoincidence,
  loadMatchBonus,
  loadCoincidence,
} from '../persistence/prefs';

// jsdom's localStorage lacks the Storage methods in this environment (no URL origin); persistence
// treats it as absent. Stub a real in-memory Storage so Save/Load AND prefs exercise the true path.
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
  };
}
beforeAll(() => vi.stubGlobal('localStorage', memoryStorage()));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  clearMaxSteps(); // each test starts from the config-default cap
  clearPlateauRelEps(); // …and the config-default convergence strictness
  clearDisabledCarriers(); // …and every reading on
  clearMatchBonus(); // …and both reinforcement toggles at their config defaults (on)
  clearCoincidence();
  clearResults();
});

function mount(opts: FakeSessionOptions = {}): {
  root: HTMLElement;
  sessions: FakeSession[];
} {
  const sessions: FakeSession[] = [];
  const root = document.createElement('div');
  document.body.appendChild(root);
  startApp(root, (f, d, cfg) => {
    const s = makeFakeSession(f, d, { ...opts, cfg }); // thread the composed cfg (contract)
    sessions.push(s);
    return s;
  });
  return { root, sessions };
}

const q = <T extends HTMLElement>(root: HTMLElement, sel: string): T =>
  root.querySelector(sel) as T;
const cells = (root: HTMLElement): HTMLElement[] => [...root.querySelectorAll<HTMLElement>('.traj')];
const selectedId = (root: HTMLElement): string | undefined =>
  q<HTMLElement>(root, '.traj.selected')?.dataset.id;
const bestId = (root: HTMLElement): string | undefined =>
  q<HTMLElement>(root, '.traj.best')?.dataset.id;
/** The score panel's displayed TOTAL — identifies WHICH trajectory the main display shows. */
const displayedTotal = (root: HTMLElement): string =>
  q<HTMLElement>(root, '.scoretop .bignum:nth-child(3) .bigval').textContent!;
const step = (root: HTMLElement): void => q<HTMLButtonElement>(root, '[data-a="step"]').click();

describe('app: trajectory gallery', () => {
  it('renders one thumbnail per trajectory with score, status badge, kind, and steps', () => {
    const { root } = mount({ slots: 3 });
    const slots = cells(root);
    expect(slots.length).toBe(3);
    expect(slots.map((c) => c.dataset.id)).toEqual(['0', '1', '2']);
    expect(slots[0]!.querySelector('.tbadge')!.textContent).toBe('running');
    expect(slots[0]!.querySelector('[data-t="kind"]')!.textContent).toContain('init');
    expect(slots[0]!.querySelector('.tscore')!.textContent).toMatch(/-?\d+\.\d{3}/);
    expect(root.querySelectorAll('.traj.best').length).toBe(1);
    expect(root.querySelectorAll('.traj.selected').length).toBe(1);
    root.remove();
  });

  it('GROWS across restarts and never drops a finished endpoint', () => {
    // ids 0 and 2 plateau at their own step 1; budget 2 → replacements id 2 (fresh), id 3 (mutant)
    const { root } = mount({ slots: 2, plateauAt: [1, undefined, 1], maxRestarts: 2 });
    step(root); // id 0 plateaus
    step(root); // id 0 retired → id 2 spawned (fresh), advances to 1 → plateaus
    expect(cells(root).map((c) => c.dataset.id)).toEqual(['0', '1', '2']);
    step(root); // id 2 retired → id 3 spawned (mutant)
    step(root); // everything left keeps running — endpoints must still be there
    const all = cells(root);
    expect(all.map((c) => c.dataset.id)).toEqual(['0', '1', '2', '3']);
    // the endpoints stay, frozen with their badges; kinds label the lineage
    expect(all[0]!.querySelector('.tbadge')!.textContent).toBe('converged');
    expect(all[2]!.querySelector('[data-t="kind"]')!.textContent).toContain('fresh');
    expect(all[3]!.querySelector('[data-t="kind"]')!.textContent).toContain('mutant');
    root.remove();
  });
});

describe('app: STICKY selection (never auto-switches)', () => {
  it('defaults to the first trajectory and IGNORES a score overtake by another trajectory', () => {
    const { root, sessions } = mount({ slots: 3 });
    const s = sessions[0]!;
    expect(selectedId(root)).toBe('0'); // default: slot 0's trajectory
    const t0 = s.allTrajectories()[0]!.exactTotal;
    expect(displayedTotal(root)).toBe(t0.toFixed(3));
    // ADVERSARIAL: trajectory 2 takes the lead — display must not follow
    s.forceTotal(2, t0 + 100);
    step(root); // forces a re-render
    expect(selectedId(root)).toBe('0'); // selection unchanged
    expect(displayedTotal(root)).toBe(t0.toFixed(3)); // main display still trajectory 0
    expect(bestId(root)).toBe('2'); // …while the subtle best marker moved
    root.remove();
  });

  it('changes ONLY on a thumbnail click', () => {
    const { root, sessions } = mount({ slots: 3 });
    const t1 = sessions[0]!.allTrajectories()[1]!.exactTotal;
    q<HTMLElement>(root, '.traj[data-id="1"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(selectedId(root)).toBe('1');
    expect(displayedTotal(root)).toBe(t1.toFixed(3));
    root.remove();
  });

  it('survives the selected trajectory finishing AND its slot restarting (stays on the endpoint)', () => {
    // id 0 (the default selection) plateaus at step 1; its slot then starts replacement id 2
    const { root, sessions } = mount({ slots: 2, plateauAt: [1], maxRestarts: 1 });
    const s = sessions[0]!;
    const t0 = s.allTrajectories()[0]!.exactTotal;
    step(root); // id 0 plateaus
    step(root); // id 0 RETIRED, id 2 now occupies slot 0
    expect(s.trajectories()[0]!.id).toBe(2); // the slot really was recycled
    expect(selectedId(root)).toBe('0'); // selection stayed on the finished endpoint…
    expect(displayedTotal(root)).toBe(t0.toFixed(3)); // …and the display shows its frozen score
    step(root);
    step(root);
    expect(selectedId(root)).toBe('0'); // still no auto-switch as others keep running
    root.remove();
  });
});

describe('app: persistent results at done', () => {
  it('clears NOTHING when the session reaches done: gallery, score panel, caption all stay', () => {
    const { root, sessions } = mount({ slots: 2, plateauAt: [1, 1] });
    step(root); // both plateau → done (no restart budget)
    expect(sessions[0]!.status).toBe('done');
    // gallery intact, endpoints shown frozen
    expect(cells(root).length).toBe(2);
    const badges = [...root.querySelectorAll('.tbadge')].map((b) => b.textContent);
    expect(badges).toEqual(['converged', 'converged']);
    // score panel still shows the selected trajectory
    expect(displayedTotal(root)).toMatch(/-?\d+\.\d{3}/);
    expect(selectedId(root)).toBe('0');
    // caption keeps the live run info (not reset/cleared)
    const cap = q<HTMLElement>(root, '#figcaption').textContent!;
    expect(cap).toContain('figure seed');
    expect(cap).toContain('step 1');
    // done arms Save and disables Run — the only state change at completion
    expect(q<HTMLButtonElement>(root, '[data-a="save"]').disabled).toBe(false);
    expect(q<HTMLButtonElement>(root, '[data-a="runpause"]').disabled).toBe(true);
    root.remove();
  });

  it('Reset remains an explicit full clear (fresh session, selection back to first)', () => {
    const { root, sessions } = mount({ slots: 2, plateauAt: [1, 1] });
    step(root); // done
    q<HTMLElement>(root, '.traj[data-id="1"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(selectedId(root)).toBe('1');
    q<HTMLButtonElement>(root, '[data-a="reset"]').click();
    expect(sessions.length).toBe(2); // brand-new session, same seeds
    expect(sessions[1]!.figureSeed).toBe(sessions[0]!.figureSeed);
    expect(selectedId(root)).toBe('0'); // selection reset to the new first trajectory
    expect(cells(root).length).toBe(2);
    root.remove();
  });
});

describe('app: persistent maxSteps (localStorage)', () => {
  it('initializes from config when nothing is stored, and persists edits across Reset', () => {
    const { root, sessions } = mount();
    const el = q<HTMLInputElement>(root, '[data-a="maxsteps"]');
    expect(Number(el.value)).toBe(config.converge.maxSteps); // no stored pref → config default
    el.value = '777';
    el.dispatchEvent(new Event('change'));
    expect(sessions[0]!.setMaxStepsCalls).toContain(777);
    q<HTMLButtonElement>(root, '[data-a="reset"]').click();
    expect(sessions.length).toBe(2);
    expect(sessions[1]!.setMaxStepsCalls).toContain(777); // the cap persisted across Reset
    expect(q<HTMLInputElement>(root, '[data-a="maxsteps"]').value).toBe('777');
    root.remove();
  });

  it('round-trips through localStorage: a fresh startApp ("reload") restores the edited cap', () => {
    const a = mount();
    const el = q<HTMLInputElement>(a.root, '[data-a="maxsteps"]');
    el.value = '12345'; // the user "might need ~10k" — well past the default
    el.dispatchEvent(new Event('change'));
    a.root.remove();
    // simulate a page reload: a brand-new app instance over the same localStorage
    const b = mount();
    expect(q<HTMLInputElement>(b.root, '[data-a="maxsteps"]').value).toBe('12345');
    expect(b.sessions[0]!.setMaxStepsCalls).toContain(12345); // applied to the initial session
    b.root.remove();
  });
});

describe('app: persistent plateauRelEps (localStorage)', () => {
  it('initializes from config when nothing is stored, and persists edits across Reset', () => {
    const { root, sessions } = mount();
    const el = q<HTMLInputElement>(root, '[data-a="plateaueps"]');
    expect(Number(el.value)).toBe(config.converge.plateauRelEps); // no stored pref → config default
    el.value = '1e-5'; // stricter than default — "keep going while it still improves"
    el.dispatchEvent(new Event('change'));
    expect(sessions[0]!.setPlateauRelEpsCalls).toContain(1e-5);
    q<HTMLButtonElement>(root, '[data-a="reset"]').click();
    expect(sessions.length).toBe(2);
    expect(sessions[1]!.setPlateauRelEpsCalls).toContain(1e-5); // persisted across Reset
    expect(Number(q<HTMLInputElement>(root, '[data-a="plateaueps"]').value)).toBe(1e-5);
    root.remove();
  });

  it('persists across a NEW SEED session too (same precedence as maxSteps)', () => {
    const { root, sessions } = mount();
    const el = q<HTMLInputElement>(root, '[data-a="plateaueps"]');
    el.value = '0.002';
    el.dispatchEvent(new Event('change'));
    q<HTMLButtonElement>(root, '[data-a="newfig"]').click(); // new figure seed → new session
    expect(sessions.length).toBe(2);
    expect(sessions[1]!.setPlateauRelEpsCalls).toContain(0.002);
    root.remove();
  });

  it('round-trips through localStorage: a fresh startApp ("reload") restores the edited strictness', () => {
    const a = mount();
    const el = q<HTMLInputElement>(a.root, '[data-a="plateaueps"]');
    el.value = '3e-6'; // scientific input, far stricter than the default
    el.dispatchEvent(new Event('change'));
    a.root.remove();
    // simulate a page reload: a brand-new app instance over the same localStorage
    const b = mount();
    expect(Number(q<HTMLInputElement>(b.root, '[data-a="plateaueps"]').value)).toBe(3e-6);
    expect(b.sessions[0]!.setPlateauRelEpsCalls).toContain(3e-6); // applied to the initial session
    b.root.remove();
  });

  it('editing plateau eps never disturbs the run mode or the display (non-retroactive contract)', () => {
    const { root, sessions } = mount({ slots: 2, plateauAt: [1, 1] });
    step(root); // both plateau → done
    expect(sessions[0]!.status).toBe('done');
    const el = q<HTMLInputElement>(root, '[data-a="plateaueps"]');
    el.value = '1e-9'; // drastically stricter, AFTER everything finished
    el.dispatchEvent(new Event('change'));
    // finished endpoints stay converged; done stays done; Save stays armed
    expect(sessions[0]!.status).toBe('done');
    const badges = [...root.querySelectorAll('.tbadge')].map((b) => b.textContent);
    expect(badges).toEqual(['converged', 'converged']);
    expect(q<HTMLButtonElement>(root, '[data-a="save"]').disabled).toBe(false);
    root.remove();
  });
});

describe('app: readings toggles (carrier on/off chips)', () => {
  const LEN = 'page.displacement.magnitude'; // 'length' — a merged carrier with an alias
  const chip = (root: HTMLElement, id: string): HTMLButtonElement =>
    q<HTMLButtonElement>(root, `.chip[data-cid="${id}"]`);
  const pendhint = (root: HTMLElement): HTMLElement => q<HTMLElement>(root, '[data-r="pending"]');

  it('renders one chip per DISTINCT carrier, grouped, all on by default', () => {
    const { root } = mount();
    const chips = [...root.querySelectorAll<HTMLElement>('#readingspanel .chip')];
    const all = allCarriers(config);
    expect(chips.length).toBe(all.length); // 16 under the v1 geometry — but derived, not hardcoded
    expect(new Set(chips.map((c) => c.dataset.cid))).toEqual(new Set(all.map((c) => c.id)));
    expect(chips.every((c) => !c.classList.contains('off'))).toBe(true);
    expect(chip(root, LEN).textContent).toBe('length'); // plain-English label, no ids
    expect(root.querySelectorAll('#readingspanel .rgroup').length).toBe(5); // start·mid·end·displacement·angles
    expect(pendhint(root).hidden).toBe(true); // pending = live at start
    expect(q<HTMLElement>(root, '[data-r="count"]').textContent).toBe(`${all.length}/${all.length} on`);
    root.remove();
  });

  it('clicking toggles the PENDING set only: persisted at once, live session untouched', () => {
    const { root, sessions } = mount();
    const before = displayedTotal(root);
    chip(root, LEN).click();
    // persisted immediately (survives reloads)…
    expect(loadDisabledCarriers()).toEqual([LEN]);
    // …chip shows off + pending, strip hints "applies on Reset"
    expect(chip(root, LEN).classList.contains('off')).toBe(true);
    expect(chip(root, LEN).classList.contains('pending')).toBe(true);
    expect(pendhint(root).hidden).toBe(false);
    // ADVERSARIAL: the LIVE session keeps its objective — cfg snapshot unchanged, display unchanged
    expect(sessions.length).toBe(1); // no new session was created
    expect(sessions[0]!.cfg.carriers.disabled).toEqual([]);
    step(root);
    expect(displayedTotal(root)).toBe(before);
    // clicking again re-enables and clears the hint
    chip(root, LEN).click();
    expect(loadDisabledCarriers()).toEqual([]);
    expect(chip(root, LEN).classList.contains('off')).toBe(false);
    expect(pendhint(root).hidden).toBe(true);
    root.remove();
  });

  it('applies on Reset: the NEXT session is constructed with the disabled set; hint clears', () => {
    const { root, sessions } = mount();
    chip(root, LEN).click();
    q<HTMLButtonElement>(root, '[data-a="reset"]').click();
    expect(sessions.length).toBe(2);
    expect(sessions[1]!.cfg.carriers.disabled).toEqual([LEN]); // the toggle BIT at construction
    // pending == live again: hint gone, chip stays off (still excluded, no longer "pending")
    expect(pendhint(root).hidden).toBe(true);
    expect(chip(root, LEN).classList.contains('off')).toBe(true);
    expect(chip(root, LEN).classList.contains('pending')).toBe(false);
    // …and the disabled reading is genuinely OUT of the running objective's breakdown
    const b = sessions[1]!.detail(sessions[1]!.trajectories()[0]!.id)!.breakdown;
    expect(b.distinctCarriers).toBe(allCarriers(config).length - 1);
    for (const r of b.relations) expect(r.carriers.some((c) => c.id === LEN)).toBe(false);
    root.remove();
  });

  it('applies on a NEW SEED session too, and round-trips a "reload" (fresh startApp)', () => {
    const a = mount();
    a.root.querySelector<HTMLButtonElement>(`.chip[data-cid="${LEN}"]`)!.click();
    q<HTMLButtonElement>(a.root, '[data-a="newfig"]').click(); // new figure seed → new session
    expect(a.sessions[1]!.cfg.carriers.disabled).toEqual([LEN]);
    a.root.remove();
    // simulate a page reload: a brand-new app instance over the same localStorage
    const b = mount();
    expect(b.sessions[0]!.cfg.carriers.disabled).toEqual([LEN]); // applied to the INITIAL session
    expect(chip(b.root, LEN).classList.contains('off')).toBe(true);
    expect(pendhint(b.root).hidden).toBe(true); // pending == live: restored, not "pending"
    b.root.remove();
  });

  it('CANONICALIZES stored ids at the boundary: an ALIAS or stale id can never make chips lie', () => {
    // hand-edited / legacy storage: a merged-away alias of 'length' plus a stale garbage id
    localStorage.setItem(
      'diagram-evolver:prefs:disabledCarriers',
      JSON.stringify(['frame.displacement.magnitude', 'no.such.reading']),
    );
    const { root, sessions } = mount();
    // the session excludes the reading AND the chip shows it — same canonical set everywhere
    expect(sessions[0]!.cfg.carriers.disabled).toEqual([LEN]);
    expect(chip(root, LEN).classList.contains('off')).toBe(true);
    expect(pendhint(root).hidden).toBe(true); // pending == live (no phantom "pending" from garbage)
    // and the toggle is CLEARABLE: one click re-enables (the alias can't linger in the set)
    chip(root, LEN).click();
    expect(loadDisabledCarriers()).toEqual([]);
    expect(chip(root, LEN).classList.contains('off')).toBe(false);
    q<HTMLButtonElement>(root, '[data-a="reset"]').click();
    expect(sessions[1]!.cfg.carriers.disabled).toEqual([]); // fully back on
    root.remove();
  });
});

describe('app: reinforcement controls (matches chip / coincidence 3-state selector)', () => {
  const rchip = (root: HTMLElement, key: string): HTMLButtonElement =>
    q<HTMLButtonElement>(root, `#reinforcepanel .chip[data-rk="${key}"]`);
  const cchip = (root: HTMLElement, mode: string): HTMLButtonElement =>
    q<HTMLButtonElement>(root, `#reinforcepanel .chip[data-cm="${mode}"]`);
  const rpend = (root: HTMLElement): HTMLElement =>
    q<HTMLElement>(root, '#reinforcepanel [data-r="pending"]');
  /** The selector's SELECTED (not .off) settings — must always be exactly one. */
  const selectedModes = (root: HTMLElement): string[] =>
    [...root.querySelectorAll<HTMLElement>('#reinforcepanel .chip[data-cm]')]
      .filter((c) => !c.classList.contains('off'))
      .map((c) => c.dataset.cm!);

  it('renders defaults: matches ON, coincidence selector on the CONFIG mode, no pending hint', () => {
    const { root, sessions } = mount();
    expect(rchip(root, 'matchBonus').classList.contains('off')).toBe(false);
    expect(rchip(root, 'matchBonus').classList.contains('pending')).toBe(false);
    // exactly one selected mode chip: the config default (weight ≠ 0 ⇒ its mode, i.e. 'weak')
    expect(selectedModes(root)).toEqual([config.bonuses.coincidence.mode]);
    for (const m of ['off', 'weak', 'strong']) {
      expect(cchip(root, m).classList.contains('pending')).toBe(false);
    }
    expect(rpend(root).hidden).toBe(true);
    // the initial session runs the config defaults
    expect(sessions[0]!.cfg.aggregation.matchBonus).toBe(true);
    expect(sessions[0]!.cfg.bonuses.coincidence.weight).toBe(config.bonuses.coincidence.weight);
    expect(sessions[0]!.cfg.bonuses.coincidence.mode).toBe(config.bonuses.coincidence.mode);
    root.remove();
  });

  it('selecting a mode changes the PENDING set only: persisted at once, live session untouched', () => {
    const { root, sessions } = mount();
    const before = displayedTotal(root);
    rchip(root, 'matchBonus').click();
    cchip(root, 'weak').click(); // live default is 'strong' (2026-07-03 promotion) — weak is a CHANGE
    // persisted immediately (survives reloads)…
    expect(loadMatchBonus()).toBe(false);
    expect(loadCoincidence()).toBe('weak');
    // …the selector moved to weak (exclusive) and marks it pending; the hint shows
    expect(selectedModes(root)).toEqual(['weak']);
    expect(cchip(root, 'weak').classList.contains('pending')).toBe(true);
    expect(cchip(root, 'strong').classList.contains('pending')).toBe(false);
    expect(rpend(root).hidden).toBe(false);
    // ADVERSARIAL: the LIVE session keeps its objective — cfg snapshot unchanged, display unchanged
    expect(sessions.length).toBe(1); // no new session was created
    expect(sessions[0]!.cfg.aggregation.matchBonus).toBe(true);
    expect(sessions[0]!.cfg.bonuses.coincidence.weight).toBe(config.bonuses.coincidence.weight);
    expect(sessions[0]!.cfg.bonuses.coincidence.mode).toBe('strong');
    step(root);
    expect(displayedTotal(root)).toBe(before);
    // …and each further transition re-persists: weak → off → back to the live strong clears all
    cchip(root, 'off').click();
    expect(loadCoincidence()).toBe('off');
    expect(selectedModes(root)).toEqual(['off']);
    expect(cchip(root, 'off').classList.contains('pending')).toBe(true);
    rchip(root, 'matchBonus').click();
    cchip(root, 'strong').click();
    expect(loadMatchBonus()).toBe(true);
    expect(loadCoincidence()).toBe('strong');
    expect(rpend(root).hidden).toBe(true); // pending == live again
    root.remove();
  });

  it('matchBonus applies on Reset: the NEXT session aggregates differently on the SAME seed', () => {
    const { root, sessions } = mount();
    const id0 = sessions[0]!.trajectories()[0]!.id;
    const before = sessions[0]!.detail(id0)!.breakdown.total;
    const beforeShown = displayedTotal(root);
    rchip(root, 'matchBonus').click();
    q<HTMLButtonElement>(root, '[data-a="reset"]').click();
    expect(sessions.length).toBe(2);
    expect(sessions[1]!.cfg.aggregation.matchBonus).toBe(false); // the toggle BIT at construction
    // same figure/data seeds, different RELATION AGGREGATION ⇒ a genuinely different total
    const id0b = sessions[1]!.trajectories()[0]!.id;
    const after = sessions[1]!.detail(id0b)!.breakdown.total;
    expect(sessions[1]!.figureSeed).toBe(sessions[0]!.figureSeed);
    expect(after).not.toBe(before);
    expect(displayedTotal(root)).not.toBe(beforeShown); // visible at 3 decimals too
    // pending == live again: hint gone, chip stays off (still applied, no longer "pending")
    expect(rpend(root).hidden).toBe(true);
    expect(rchip(root, 'matchBonus').classList.contains('off')).toBe(true);
    expect(rchip(root, 'matchBonus').classList.contains('pending')).toBe(false);
    root.remove();
  });

  it('live → off applies on Reset: weight 0 removes exactly the bonus from the total', () => {
    const { root, sessions } = mount();
    const id0 = sessions[0]!.trajectories()[0]!.id;
    const before = sessions[0]!.detail(id0)!.breakdown;
    expect(before.bonuses.relationCoin.length).toBeGreaterThan(0); // active at defaults
    cchip(root, 'off').click();
    q<HTMLButtonElement>(root, '[data-a="reset"]').click();
    expect(sessions.length).toBe(2);
    expect(sessions[1]!.cfg.bonuses.coincidence.weight).toBe(0); // off ⇒ weight 0 (core skips)
    const after = sessions[1]!.detail(sessions[1]!.trajectories()[0]!.id)!.breakdown;
    expect(after.bonuses.coincidence).toBe(0);
    expect(after.bonuses.relationCoin).toEqual([]);
    expect(after.bonuses.pairs).toEqual([]);
    // reward and penalty are untouched — the total lost exactly the bonus term
    expect(after.reward).toBe(before.reward);
    expect(after.penalty).toBe(before.penalty);
    expect(after.total).toBeCloseTo(before.total - before.bonuses.coincidence, 12);
    // pending == live again: the selector rests on 'off', no pending mark, no hint
    expect(selectedModes(root)).toEqual(['off']);
    expect(cchip(root, 'off').classList.contains('pending')).toBe(false);
    expect(rpend(root).hidden).toBe(true);
    root.remove();
  });

  it('strong → weak applies on Reset: the NEXT session scores under mode weak (same weight)', () => {
    const { root, sessions } = mount();
    cchip(root, 'weak').click(); // the non-default direction since the 2026-07-03 promotion
    q<HTMLButtonElement>(root, '[data-a="reset"]').click();
    expect(sessions.length).toBe(2);
    expect(sessions[1]!.cfg.bonuses.coincidence.mode).toBe('weak'); // the selection BIT here
    expect(sessions[1]!.cfg.bonuses.coincidence.weight).toBe(config.bonuses.coincidence.weight);
    // the fake session scores under ITS cfg: the breakdown really is the weak-mode scoring
    const b = sessions[1]!.detail(sessions[1]!.trajectories()[0]!.id)!.breakdown;
    const want = scoreExact(
      seedToFigure(sessions[1]!.figureSeed),
      seedToDataSet(sessions[1]!.dataSeed),
      sessions[1]!.cfg,
    );
    expect(b.total).toBe(want.total);
    expect(b.bonuses.coincidence).toBe(want.bonuses.coincidence);
    // pending == live again on the weak chip
    expect(selectedModes(root)).toEqual(['weak']);
    expect(cchip(root, 'weak').classList.contains('pending')).toBe(false);
    expect(rpend(root).hidden).toBe(true);
    root.remove();
  });

  it('off → strong applies on Reset: the term returns AT the strong mode, not the weak one', () => {
    const { root, sessions } = mount();
    cchip(root, 'off').click();
    q<HTMLButtonElement>(root, '[data-a="reset"]').click();
    expect(sessions[1]!.cfg.bonuses.coincidence.weight).toBe(0);
    cchip(root, 'strong').click();
    expect(cchip(root, 'strong').classList.contains('pending')).toBe(true); // live is still off
    q<HTMLButtonElement>(root, '[data-a="reset"]').click();
    expect(sessions.length).toBe(3);
    expect(sessions[2]!.cfg.bonuses.coincidence.weight).toBe(config.bonuses.coincidence.weight);
    expect(sessions[2]!.cfg.bonuses.coincidence.mode).toBe('strong');
    expect(rpend(root).hidden).toBe(true);
    root.remove();
  });

  it('round-trips a "reload": a fresh startApp restores both controls into the INITIAL session', () => {
    const a = mount();
    rchip(a.root, 'matchBonus').click();
    cchip(a.root, 'strong').click();
    a.root.remove();
    // simulate a page reload: a brand-new app instance over the same localStorage
    const b = mount();
    expect(b.sessions[0]!.cfg.aggregation.matchBonus).toBe(false);
    expect(b.sessions[0]!.cfg.bonuses.coincidence.mode).toBe('strong');
    expect(b.sessions[0]!.cfg.bonuses.coincidence.weight).toBe(config.bonuses.coincidence.weight);
    expect(rchip(b.root, 'matchBonus').classList.contains('off')).toBe(true);
    expect(selectedModes(b.root)).toEqual(['strong']);
    expect(rpend(b.root).hidden).toBe(true); // pending == live: restored, not "pending"
    b.root.remove();
  });

  it('MIGRATES a legacy boolean pref on startup: "false" → off, "true" → weak', () => {
    const KEY = 'diagram-evolver:prefs:coincidence';
    localStorage.setItem(KEY, 'false'); // a pre-3-state user who had turned the bonus off
    const a = mount();
    expect(a.sessions[0]!.cfg.bonuses.coincidence.weight).toBe(0);
    expect(selectedModes(a.root)).toEqual(['off']);
    expect(rpend(a.root).hidden).toBe(true);
    a.root.remove();
    localStorage.setItem(KEY, 'true'); // …and one who had it on: the weak formula, the only one then
    const b = mount();
    expect(b.sessions[0]!.cfg.bonuses.coincidence.weight).toBe(config.bonuses.coincidence.weight);
    expect(b.sessions[0]!.cfg.bonuses.coincidence.mode).toBe('weak');
    expect(selectedModes(b.root)).toEqual(['weak']);
    b.root.remove();
  });
});

describe('app: Save/Load', () => {
  it('Save persists the SELECTED trajectory (what the user is looking at), not best()', () => {
    const { root, sessions } = mount({ slots: 2, plateauAt: [1, 1] });
    const s = sessions[0]!;
    s.forceTotal(0, 5); // selected (default id 0)…
    s.forceTotal(1, 9); // …is NOT the best
    step(root); // done → Save armed
    expect(selectedId(root)).toBe('0');
    q<HTMLButtonElement>(root, '[data-a="save"]').click();
    q<HTMLButtonElement>(root, '[data-a="load"]').click();
    expect(q<HTMLElement>(root, '#figcaption').textContent).toContain('Loaded');
    // the loaded score is the SELECTED trajectory's total (5), not the leader's (9)
    expect(displayedTotal(root)).toBe('5.000');
    root.remove();
  });

  it('Save → Load round-trips into review mode (strip cleared only for a LOADED result)', () => {
    const { root } = mount({ slots: 2, plateauAt: [1, 1] });
    step(root); // done
    q<HTMLButtonElement>(root, '[data-a="save"]').click();
    q<HTMLButtonElement>(root, '[data-a="load"]').click();
    expect(q<HTMLElement>(root, '#figcaption').textContent).toContain('Loaded');
    expect(cells(root).length).toBe(0); // review mode is an explicit display takeover
    root.remove();
  });
});

describe('app: REFERENCE cell (golden bars benchmark)', () => {
  const LEN = 'page.displacement.magnitude';
  const click = (el: HTMLElement): void =>
    void el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const refCell = (root: HTMLElement): HTMLElement => q<HTMLElement>(root, '.refcell');
  const refScore = (root: HTMLElement): string =>
    q<HTMLElement>(root, '.refcell .tscore').textContent!;
  /** The reference's expected displayed total: golden bars of the dataset, scored under cfg. */
  const refTotal = (dataSeed: number, cfg: Config = config): string => {
    const d = seedToDataSet(dataSeed);
    return scoreExact(loudGoldenBarChart(d), d, cfg).total.toFixed(3);
  };

  it('renders FIRST with the "bars" badge (no status badge, no kind tag) and its exact total', () => {
    const { root } = mount({ slots: 3 });
    const strip = q<HTMLElement>(root, '#trajstrip');
    const first = strip.firstElementChild as HTMLElement;
    expect(first.classList.contains('refcell')).toBe(true);
    expect(first.dataset.id).toBe(String(REFERENCE_ID));
    expect(first.querySelector('[data-t="ref"]')!.textContent).toBe('bars'); // badge, not a kind tag
    expect(first.querySelector('[data-t="status"]')).toBeNull(); // it is not an optimization
    expect(first.querySelector('[data-t="kind"]')).toBeNull();
    expect(refScore(root)).toBe(refTotal(config.seeds.data));
    // every trajectory thumbnail comes AFTER it, untouched (ids and count as before)
    expect([...strip.children].slice(1).every((c) => c.classList.contains('traj'))).toBe(true);
    expect(cells(root).map((c) => c.dataset.id)).toEqual(['0', '1', '2']);
    // default selection at session start remains the FIRST REAL TRAJECTORY, never the reference
    expect(selectedId(root)).toBe('0');
    expect(first.classList.contains('selected')).toBe(false);
    root.remove();
  });

  it('selecting it shows its full breakdown and DISABLES Save; a trajectory click re-arms Save', () => {
    const { root, sessions } = mount({ slots: 2, plateauAt: [1, 1] });
    step(root); // both plateau → done → Save armed
    expect(sessions[0]!.status).toBe('done');
    const save = q<HTMLButtonElement>(root, '[data-a="save"]');
    expect(save.disabled).toBe(false);
    click(refCell(root));
    // sticky rules unchanged: the reference is now the ONE selected cell
    expect(refCell(root).classList.contains('selected')).toBe(true);
    expect(root.querySelectorAll('.traj.selected').length).toBe(0);
    // main display shows the reference figure's breakdown (total + status marker)
    expect(displayedTotal(root)).toBe(refTotal(config.seeds.data));
    expect(q<HTMLElement>(root, '.statusrow').textContent).toContain('reference');
    // Save is disabled with the explanatory tooltip — a benchmark is not an evolved result
    expect(save.disabled).toBe(true);
    expect(save.title).toBe('reference chart — not an evolved result');
    // …and the reference itself SURVIVED done untouched (still first, still badged)
    expect(q<HTMLElement>(root, '#trajstrip').firstElementChild).toBe(refCell(root));
    expect(refCell(root).querySelector('[data-t="ref"]')!.textContent).toBe('bars');
    // selecting a real trajectory re-enables Save and clears the tooltip
    click(q<HTMLElement>(root, '.traj[data-id="0"]'));
    expect(save.disabled).toBe(false);
    expect(save.title).toBe('');
    root.remove();
  });

  it('is scored under the SESSION cfg: a disabled reading changes it on the NEXT session only', () => {
    const { root, sessions } = mount();
    const before = refScore(root);
    q<HTMLButtonElement>(root, `.chip[data-cid="${LEN}"]`).click(); // pending toggle
    step(root);
    // ADVERSARIAL: the live session's reference is a construction-time snapshot — untouched
    expect(refScore(root)).toBe(before);
    q<HTMLButtonElement>(root, '[data-a="reset"]').click(); // the toggle BITES here
    expect(sessions.length).toBe(2);
    const after = refScore(root);
    expect(after).not.toBe(before); // the objective really changed the reference's total
    expect(after).toBe(refTotal(config.seeds.data, { ...config, carriers: { disabled: [LEN] } }));
    // its breakdown EXCLUDES the disabled id: select it and read the panel's census + rows
    click(refCell(root));
    expect(displayedTotal(root)).toBe(after);
    expect(q<HTMLElement>(root, '.comphdr').textContent).toContain(
      `${allCarriers(config).length - 1} distinct carriers`,
    );
    const names = [...root.querySelectorAll<HTMLElement>('.scorepanel .cname')];
    expect(names.some((n) => n.textContent!.startsWith('length'))).toBe(false);
    root.remove();
  });

  it('is NEVER the ★ best, even when its total beats every trajectory; selection stays sticky', () => {
    const { root, sessions } = mount({ slots: 3 });
    const s = sessions[0]!;
    for (const t of s.allTrajectories()) s.forceTotal(t.id, -999); // reference now beats them all
    step(root);
    expect(refCell(root).classList.contains('best')).toBe(false);
    expect(root.querySelectorAll('.refcell.best').length).toBe(0);
    expect(bestId(root)).toBeDefined(); // the ★ stayed among the (worse) trajectories
    // select the reference, keep stepping: no auto-switch away from it (sticky rules unchanged)
    click(refCell(root));
    step(root);
    step(root);
    expect(refCell(root).classList.contains('selected')).toBe(true);
    expect(displayedTotal(root)).toBe(refTotal(config.seeds.data));
    root.remove();
  });

  it('a NEW DATA SEED rebuilds it from the new dataset (deterministic seed edit)', () => {
    const { root, sessions } = mount();
    const el = q<HTMLInputElement>(root, '[data-a="dataseed"]');
    el.value = '2';
    el.dispatchEvent(new Event('change'));
    expect(sessions.length).toBe(2);
    expect(sessions[1]!.dataSeed).toBe(2);
    expect(refScore(root)).toBe(refTotal(2)); // golden bars OF THE NEW DATA, rescored
    expect(refTotal(2)).not.toBe(refTotal(1)); // a real rebuild, not a stale repaint
    root.remove();
  });

  it('a "reload" with a stored disabled reading scores the INITIAL reference under it', () => {
    // ADVERSARIAL: prefs precedence (localStorage > config default) must reach the reference on
    // the very FIRST session of a fresh startApp — not only after a toggle + Reset.
    localStorage.setItem(
      'diagram-evolver:prefs:disabledCarriers',
      JSON.stringify([LEN]),
    );
    const { root, sessions } = mount();
    expect(sessions[0]!.cfg.carriers.disabled).toEqual([LEN]); // the composed session cfg…
    const want = refTotal(config.seeds.data, { ...config, carriers: { disabled: [LEN] } });
    expect(refScore(root)).toBe(want); // …is the cfg the reference was scored under
    expect(want).not.toBe(refTotal(config.seeds.data)); // and it genuinely differs from all-on
    // its breakdown census shrank by exactly the one disabled reading
    click(refCell(root));
    expect(q<HTMLElement>(root, '.comphdr').textContent).toContain(
      `${allCarriers(config).length - 1} distinct carriers`,
    );
    root.remove();
  });

  it('Reset while the reference is selected returns selection to the first trajectory', () => {
    const { root, sessions } = mount({ slots: 2, plateauAt: [1, 1] });
    step(root); // done → Save armed
    click(refCell(root));
    const save = q<HTMLButtonElement>(root, '[data-a="save"]');
    expect(save.disabled).toBe(true); // reference selected: Save off, tooltip on
    q<HTMLButtonElement>(root, '[data-a="reset"]').click();
    expect(sessions.length).toBe(2);
    // default selection is the NEW session's first trajectory — never the reference
    expect(refCell(root).classList.contains('selected')).toBe(false);
    expect(selectedId(root)).toBe(String(sessions[1]!.trajectories()[0]!.id));
    expect(save.title).toBe(''); // the reference tooltip does not linger
    step(root); // the fresh session plateaus → done → Save re-arms for the real selection
    expect(save.disabled).toBe(false);
    root.remove();
  });

  it('shows the golden bars\' COINCIDENT TRIPLE (end y ≡ rise ≡ length) and the bonus row', () => {
    const { root, sessions } = mount();
    click(refCell(root));
    // the bonus row shows the exact weighted term of an independent rescoring under session cfg
    const d = seedToDataSet(config.seeds.data);
    const want = scoreExact(loudGoldenBarChart(d), d, sessions[0]!.cfg).bonuses.coincidence;
    expect(want).toBeGreaterThan(0); // grounded vertical bars really earn the bonus
    const row = root.querySelector('.bonusrow')!;
    expect(row).not.toBeNull();
    expect(row.textContent).toContain('coincidence bonus');
    expect(row.textContent).toContain(`w ${config.bonuses.coincidence.weight}`);
    expect(row.textContent).toContain(`+${want.toFixed(3)}`);
    // grounding + verticality make end-y ≡ rise ≡ length: all three pairs, eq 1.00, under sales
    const salesLine = root.querySelectorAll('.scorepanel .coinline')[0]!; // sections: sales first
    expect(salesLine.textContent).toContain('coincident:');
    for (const pair of ['end y ≡ rise 1.00', 'end y ≡ length 1.00', 'rise ≡ length 1.00']) {
      expect(salesLine.textContent).toContain(pair);
    }
    // strong is the DEFAULT since the 2026-07-03 promotion: the bonus row names the mode and
    // the path pairs carry their ink factor
    expect(root.querySelector('.bonusrow')!.textContent).toContain('coincidence bonus (strong)');
    expect(salesLine.textContent).toContain('ink');
    root.remove();
  });

  it('under a stored WEAK pref keeps the v2.2 rendering: mode named, NO ink factor on pair lines', () => {
    localStorage.setItem('diagram-evolver:prefs:coincidence', 'weak');
    const { root, sessions } = mount();
    expect(sessions[0]!.cfg.bonuses.coincidence.mode).toBe('weak'); // pref overrides the strong default
    click(refCell(root));
    const d = seedToDataSet(config.seeds.data);
    const want = scoreExact(loudGoldenBarChart(d), d, sessions[0]!.cfg).bonuses.coincidence;
    expect(root.querySelector('.bonusrow')!.textContent).toContain('coincidence bonus (weak)');
    expect(root.querySelector('.bonusrow')!.textContent).toContain(`+${want.toFixed(3)}`);
    const salesLine = root.querySelectorAll('.scorepanel .coinline')[0]!;
    expect(salesLine.textContent).toContain('end y ≡ rise 1.00');
    expect(salesLine.textContent).not.toContain('ink');
    root.remove();
  });

  it('under STRONG mode shows the golden triple WITH high ink-path overlaps (mode + ink rendering)', () => {
    // a stored 'strong' pref reaches the very first session — and therefore the reference cell
    localStorage.setItem('diagram-evolver:prefs:coincidence', 'strong');
    const { root, sessions } = mount();
    expect(sessions[0]!.cfg.bonuses.coincidence.mode).toBe('strong');
    click(refCell(root));
    expect(root.querySelector('.bonusrow')!.textContent).toContain('coincidence bonus (strong)');
    // ground truth: the same figure rescored independently under the session cfg
    const d = seedToDataSet(config.seeds.data);
    const want = scoreExact(loudGoldenBarChart(d), d, sessions[0]!.cfg);
    expect(root.querySelector('.bonusrow')!.textContent).toContain(
      `+${want.bonuses.coincidence.toFixed(3)}`,
    );
    // the grounded triple survives strong mode: same ink (bar ≡ plumb from the axis ≡ its rise
    // leg), each pair showing ITS core-computed overlap — high, though < 1.00: the dataset's
    // smallest bars pay the θ_ink visible-extent gate (documented core behavior, not a defect)
    const salesLine = root.querySelectorAll('.scorepanel .coinline')[0]!;
    const triple = ['end y ≡ rise', 'end y ≡ length', 'rise ≡ length'];
    for (const label of triple) {
      const pair = want.bonuses.pairs.find(
        (p) => p.key === 'sales' && `${p.aLabel} ≡ ${p.bLabel}` === label,
      )!;
      expect(pair).toBeDefined(); // the triple still earns the bonus in strong mode
      expect(pair.overlap!).toBeGreaterThan(0.7); // near-1 alignment (θ_ink discount only)
      expect(salesLine.textContent).toContain(
        `${label} ${pair.eq.toFixed(2)} · ink ${pair.overlap!.toFixed(2)}`,
      );
    }
    root.remove();
  });

  it('loses the bonus when the coincidence "off" selection bites (NEXT session), like any cfg knob', () => {
    const { root, sessions } = mount();
    q<HTMLButtonElement>(root, '#reinforcepanel .chip[data-cm="off"]').click();
    click(refCell(root));
    step(root);
    // ADVERSARIAL: the live session's reference is a construction-time snapshot — bonus still shown
    expect(root.querySelector('.bonusrow')).not.toBeNull();
    q<HTMLButtonElement>(root, '[data-a="reset"]').click(); // the toggle BITES here
    expect(sessions.length).toBe(2);
    click(refCell(root));
    expect(root.querySelector('.bonusrow')).toBeNull();
    expect(root.querySelector('.coinline')).toBeNull();
    // and the displayed total is the golden bars rescored WITHOUT the term
    const cfg0: Config = {
      ...config,
      bonuses: {
        ...config.bonuses,
        coincidence: { ...config.bonuses.coincidence, weight: 0 },
      },
    };
    expect(displayedTotal(root)).toBe(refTotal(config.seeds.data, cfg0));
    expect(refTotal(config.seeds.data, cfg0)).not.toBe(refTotal(config.seeds.data));
    root.remove();
  });

  it('config.ui.showReferenceBars = false simply removes the cell (gallery unaffected)', () => {
    const prev = config.ui.showReferenceBars;
    config.ui.showReferenceBars = false;
    try {
      const { root } = mount({ slots: 3 });
      expect(root.querySelector('.refcell')).toBeNull();
      expect(cells(root).map((c) => c.dataset.id)).toEqual(['0', '1', '2']);
      expect(selectedId(root)).toBe('0');
      root.remove();
    } finally {
      config.ui.showReferenceBars = prev;
    }
  });
});
