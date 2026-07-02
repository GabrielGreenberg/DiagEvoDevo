// @vitest-environment jsdom
//
// src/ui/controls.test.ts — the control bar, focused on the NEW max-steps control (spec §UI v2 #5)
// and the done-gated Save/Run buttons. Callbacks are spied; updateControls must reflect state
// without clobbering a focused input.

import { describe, it, expect, vi } from 'vitest';
import { mountControls, updateControls, type ControlCallbacks } from './controls';
import { config } from '../config';
import { makeFakeSession } from './fixtures';
import type { AppState } from './store';

function spies(): ControlCallbacks {
  return {
    onNewFigureSeed: vi.fn(),
    onNewDataSeed: vi.fn(),
    onEditFigureSeed: vi.fn(),
    onEditDataSeed: vi.fn(),
    onEditMaxSteps: vi.fn(),
    onRun: vi.fn(),
    onPause: vi.fn(),
    onStep: vi.fn(),
    onReset: vi.fn(),
    onSave: vi.fn(),
    onLoad: vi.fn(),
  };
}

function state(patch: Partial<AppState> = {}): AppState {
  return {
    session: makeFakeSession(1, 1),
    figureSeed: 1,
    dataSeed: 1,
    mode: 'idle',
    tick: 0,
    maxSteps: config.converge.maxSteps,
    loaded: null,
    saveCount: 0,
    ...patch,
  };
}

const input = (root: HTMLElement, a: string): HTMLInputElement =>
  root.querySelector(`[data-a="${a}"]`) as HTMLInputElement;
const button = (root: HTMLElement, a: string): HTMLButtonElement =>
  root.querySelector(`[data-a="${a}"]`) as HTMLButtonElement;

describe('controls: max steps', () => {
  it('mounts a numeric max-steps input with a sensible min/step', () => {
    const root = document.createElement('div');
    mountControls(root, spies());
    const el = input(root, 'maxsteps');
    expect(el).toBeTruthy();
    expect(el.type).toBe('number');
    expect(Number(el.min)).toBe(config.converge.minSteps);
    expect(Number(el.step)).toBeGreaterThan(0);
  });

  it('change fires onEditMaxSteps with a sanitized integer, clamped to the minimum', () => {
    const root = document.createElement('div');
    const cb = spies();
    mountControls(root, cb);
    const el = input(root, 'maxsteps');
    el.value = '7500.9';
    el.dispatchEvent(new Event('change'));
    expect(cb.onEditMaxSteps).toHaveBeenLastCalledWith(7500);
    el.value = '3'; // below the convergence minimum
    el.dispatchEvent(new Event('change'));
    expect(cb.onEditMaxSteps).toHaveBeenLastCalledWith(config.converge.minSteps);
    el.value = 'garbage'; // NaN → fall back to the config default
    el.dispatchEvent(new Event('change'));
    expect(cb.onEditMaxSteps).toHaveBeenLastCalledWith(config.converge.maxSteps);
  });

  it('updateControls reflects maxSteps unless the user is typing in it', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    mountControls(root, spies());
    const el = input(root, 'maxsteps');
    updateControls(root, state({ maxSteps: 900 }));
    expect(el.value).toBe('900');
    el.focus();
    el.value = '123';
    updateControls(root, state({ maxSteps: 900 }));
    expect(el.value).toBe('123'); // not clobbered while focused
    root.remove();
  });
});

describe('controls: run/save gating', () => {
  it('Save enabled and Run disabled exactly when the session is done', () => {
    const root = document.createElement('div');
    mountControls(root, spies());
    updateControls(root, state({ mode: 'running' }));
    expect(button(root, 'save').disabled).toBe(true);
    expect(button(root, 'runpause').disabled).toBe(false);
    expect(button(root, 'runpause').textContent).toContain('Pause');
    updateControls(root, state({ mode: 'done' }));
    expect(button(root, 'save').disabled).toBe(false);
    expect(button(root, 'runpause').disabled).toBe(true);
  });

  it('run/pause toggles by mounted mode', () => {
    const root = document.createElement('div');
    const cb = spies();
    mountControls(root, cb);
    updateControls(root, state({ mode: 'idle' }));
    button(root, 'runpause').click();
    expect(cb.onRun).toHaveBeenCalledTimes(1);
    updateControls(root, state({ mode: 'running' }));
    button(root, 'runpause').click();
    expect(cb.onPause).toHaveBeenCalledTimes(1);
  });
});
