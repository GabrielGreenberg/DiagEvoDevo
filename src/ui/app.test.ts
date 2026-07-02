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
import { config } from '../config';
import { makeFakeSession, type FakeSession, type FakeSessionOptions } from './fixtures';
import { clearResults } from '../persistence/store';
import { clearMaxSteps } from '../persistence/prefs';

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
  clearResults();
});

function mount(opts: FakeSessionOptions = {}): {
  root: HTMLElement;
  sessions: FakeSession[];
} {
  const sessions: FakeSession[] = [];
  const root = document.createElement('div');
  document.body.appendChild(root);
  startApp(root, (f, d) => {
    const s = makeFakeSession(f, d, opts);
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
