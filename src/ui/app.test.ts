// @vitest-environment jsdom
//
// src/ui/app.test.ts — the wired app against a CONTRACT fake session (./fixtures): the trajectory
// strip shows one thumbnail per slot, the max-steps control drives session.setMaxSteps live and
// PERSISTS across Reset/new-session, Step advances every active trajectory, and Save arms when the
// session is done. (Canvas 2D is unavailable in jsdom; drawing is skipped, DOM structure is not.)

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { startApp } from './app';
import { config } from '../config';
import { makeFakeSession, type FakeSession } from './fixtures';
import { clearResults } from '../persistence/store';

// jsdom's localStorage lacks the Storage methods in this environment (no URL origin); persistence
// treats it as absent. Stub a real in-memory Storage so Save/Load exercises the true code path.
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

function mount(opts: { slots?: number; plateauAt?: number[] } = {}): {
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

describe('app v2', () => {
  it('renders one trajectory thumbnail per slot with score, status badge, and kind', () => {
    const { root } = mount({ slots: 4 });
    const slots = root.querySelectorAll('.traj');
    expect(slots.length).toBe(4);
    expect(slots[0]!.querySelector('.tbadge')!.textContent).toBe('running');
    expect(slots[0]!.querySelector('[data-t="kind"]')!.textContent).toContain('init');
    expect(slots[1]!.querySelector('[data-t="kind"]')!.textContent).toContain('fresh');
    expect(slots[2]!.querySelector('[data-t="kind"]')!.textContent).toContain('mutant');
    expect(slots[0]!.querySelector('.tscore')!.textContent).toMatch(/-?\d+\.\d{3}/);
    // exactly one slot is marked best
    expect(root.querySelectorAll('.traj.best').length).toBe(1);
    root.remove();
  });

  it('max-steps edits reach the live session AND persist across Reset (new session)', () => {
    const { root, sessions } = mount();
    const el = q<HTMLInputElement>(root, '[data-a="maxsteps"]');
    expect(Number(el.value)).toBe(config.converge.maxSteps); // initialized from config
    el.value = '777';
    el.dispatchEvent(new Event('change'));
    expect(sessions[0]!.setMaxStepsCalls).toContain(777);
    q<HTMLButtonElement>(root, '[data-a="reset"]').click();
    expect(sessions.length).toBe(2); // Reset = fresh session, same seeds
    expect(sessions[1]!.figureSeed).toBe(sessions[0]!.figureSeed);
    expect(sessions[1]!.setMaxStepsCalls).toContain(777); // the cap persisted
    expect(q<HTMLInputElement>(root, '[data-a="maxsteps"]').value).toBe('777');
    root.remove();
  });

  it('Step advances active trajectories; a finished session arms Save and disables Run', () => {
    const { root, sessions } = mount({ slots: 2, plateauAt: [2, 3] });
    const step = q<HTMLButtonElement>(root, '[data-a="step"]');
    step.click();
    expect(sessions[0]!.trajectories()[0]!.steps).toBe(1);
    step.click();
    step.click(); // both plateaued now → session done
    expect(sessions[0]!.status).toBe('done');
    expect(q<HTMLButtonElement>(root, '[data-a="save"]').disabled).toBe(false);
    expect(q<HTMLButtonElement>(root, '[data-a="runpause"]').disabled).toBe(true);
    // the strip badges follow: both converged
    const badges = [...root.querySelectorAll('.tbadge')].map((b) => b.textContent);
    expect(badges).toEqual(['converged', 'converged']);
    root.remove();
  });

  it('Save → Load round-trips the best figure into review mode', () => {
    clearResults();
    const { root } = mount({ slots: 2, plateauAt: [1, 1] });
    q<HTMLButtonElement>(root, '[data-a="step"]').click(); // done
    q<HTMLButtonElement>(root, '[data-a="save"]').click();
    q<HTMLButtonElement>(root, '[data-a="load"]').click();
    expect(q<HTMLElement>(root, '#figcaption').textContent).toContain('Loaded');
    expect(root.querySelectorAll('.traj').length).toBe(0); // strip cleared in review mode
    clearResults();
    root.remove();
  });
});
