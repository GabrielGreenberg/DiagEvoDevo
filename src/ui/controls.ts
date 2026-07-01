// src/ui/controls.ts
//
// The control bar: independent, editable figure/data seeds; Run/Pause/Step/Reset; Save/Load. Built
// once (mountControls) with listeners attached; updateControls only toggles button state/text so the
// per-frame render loop never clobbers a seed the user is typing.

import type { AppState } from './store';

export interface ControlCallbacks {
  onNewFigureSeed(): void;
  onNewDataSeed(): void;
  onEditFigureSeed(v: number): void;
  onEditDataSeed(v: number): void;
  onRun(): void;
  onPause(): void;
  onStep(): void;
  onReset(): void;
  onSave(): void;
  onLoad(): void;
}

export function mountControls(root: HTMLElement, cb: ControlCallbacks): void {
  root.innerHTML = `
    <div class="seeds">
      <label>figure seed <input type="number" data-a="figseed" class="seedinput" /></label>
      <button data-a="newfig" title="random figure seed">🎲 new</button>
      <label>data seed <input type="number" data-a="dataseed" class="seedinput" /></label>
      <button data-a="newdata" title="random data seed">🎲 new</button>
    </div>
    <div class="runbtns">
      <button data-a="runpause" class="primary">▶ Run</button>
      <button data-a="step">Step</button>
      <button data-a="reset">Reset</button>
      <span class="spacer"></span>
      <button data-a="save" disabled>Save</button>
      <button data-a="load">Load</button>
    </div>`;

  const q = <T extends HTMLElement>(a: string): T => root.querySelector(`[data-a="${a}"]`) as T;
  q<HTMLButtonElement>('newfig').addEventListener('click', () => cb.onNewFigureSeed());
  q<HTMLButtonElement>('newdata').addEventListener('click', () => cb.onNewDataSeed());
  q<HTMLButtonElement>('step').addEventListener('click', () => cb.onStep());
  q<HTMLButtonElement>('reset').addEventListener('click', () => cb.onReset());
  q<HTMLButtonElement>('save').addEventListener('click', () => cb.onSave());
  q<HTMLButtonElement>('load').addEventListener('click', () => cb.onLoad());
  q<HTMLButtonElement>('runpause').addEventListener('click', () => {
    if (root.dataset.mode === 'running') cb.onPause();
    else cb.onRun();
  });
  q<HTMLInputElement>('figseed').addEventListener('change', (e) =>
    cb.onEditFigureSeed(Number((e.target as HTMLInputElement).value)),
  );
  q<HTMLInputElement>('dataseed').addEventListener('change', (e) =>
    cb.onEditDataSeed(Number((e.target as HTMLInputElement).value)),
  );
}

export function updateControls(root: HTMLElement, s: AppState): void {
  root.dataset.mode = s.mode;
  const runpause = root.querySelector('[data-a="runpause"]') as HTMLButtonElement;
  const save = root.querySelector('[data-a="save"]') as HTMLButtonElement;
  const figseed = root.querySelector('[data-a="figseed"]') as HTMLInputElement;
  const dataseed = root.querySelector('[data-a="dataseed"]') as HTMLInputElement;
  runpause.textContent = s.mode === 'running' ? '⏸ Pause' : '▶ Run';
  // Save enabled only once the run has converged (ARCHITECTURE.md: convergence enables Save)
  save.disabled = s.mode !== 'converged';
  // reflect seeds without clobbering an input the user is editing
  if (document.activeElement !== figseed) figseed.value = String(s.figureSeed);
  if (document.activeElement !== dataseed) dataseed.value = String(s.dataSeed);
}
