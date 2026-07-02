// src/ui/controls.ts
//
// The control bar: independent, editable figure/data seeds; the live "max steps" cap; the live
// "plateau eps" convergence strictness; Run/Pause/Step/Reset; Save/Load. Built once (mountControls)
// with listeners attached; updateControls only toggles button state/text so the per-frame render
// loop never clobbers an input the user is typing.

import { config } from '../config';
import type { AppState } from './store';

export interface ControlCallbacks {
  onNewFigureSeed(): void;
  onNewDataSeed(): void;
  onEditFigureSeed(v: number): void;
  onEditDataSeed(v: number): void;
  /** The live per-trajectory step cap → session.setMaxSteps(n) (spec §UI v2 maxSteps control). */
  onEditMaxSteps(v: number): void;
  /** The live convergence strictness → session.setPlateauRelEps(x) (spec: elastic convergence). */
  onEditPlateauRelEps(v: number): void;
  onRun(): void;
  onPause(): void;
  onStep(): void;
  onReset(): void;
  onSave(): void;
  onLoad(): void;
}

// Spinner affordances only (the actual cap value is unconstrained above the convergence minimum).
const MAX_STEPS_MIN = config.converge.minSteps; // a cap below minSteps could never even plateau
const MAX_STEPS_STEP = 100; // spinner increment — display-only

export function mountControls(root: HTMLElement, cb: ControlCallbacks): void {
  root.innerHTML = `
    <div class="seeds">
      <label>figure seed <input type="number" data-a="figseed" class="seedinput" /></label>
      <button data-a="newfig" title="random figure seed">🎲 new</button>
      <label>data seed <input type="number" data-a="dataseed" class="seedinput" /></label>
      <button data-a="newdata" title="random data seed">🎲 new</button>
      <label>max steps <input type="number" data-a="maxsteps" class="seedinput stepsinput"
        min="${MAX_STEPS_MIN}" step="${MAX_STEPS_STEP}"
        title="per-trajectory step cap (live: raising it un-caps capped trajectories)" /></label>
      <label>plateau eps <input type="number" data-a="plateaueps" class="seedinput stepsinput"
        min="0" step="any"
        title="convergence flatness threshold — smaller = stricter = runs continue longer; relative score spread over the plateau window" /></label>
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
  q<HTMLInputElement>('maxsteps').addEventListener('change', (e) => {
    // number inputs surface garbage/cleared text as '' — fall back to the config default then
    const str = (e.target as HTMLInputElement).value.trim();
    const raw = str === '' ? NaN : Number(str);
    const v = Number.isFinite(raw) ? Math.max(MAX_STEPS_MIN, Math.trunc(raw)) : config.converge.maxSteps;
    cb.onEditMaxSteps(v);
  });
  q<HTMLInputElement>('plateaueps').addEventListener('change', (e) => {
    // scientific (3e-4) and decimal (0.0003) both parse via Number; the threshold is a relative
    // spread, so only finite POSITIVE values are meaningful — anything else falls back to config
    const str = (e.target as HTMLInputElement).value.trim();
    const raw = str === '' ? NaN : Number(str);
    const v = Number.isFinite(raw) && raw > 0 ? raw : config.converge.plateauRelEps;
    cb.onEditPlateauRelEps(v);
  });
}

export function updateControls(root: HTMLElement, s: AppState): void {
  root.dataset.mode = s.mode;
  const runpause = root.querySelector('[data-a="runpause"]') as HTMLButtonElement;
  const save = root.querySelector('[data-a="save"]') as HTMLButtonElement;
  const figseed = root.querySelector('[data-a="figseed"]') as HTMLInputElement;
  const dataseed = root.querySelector('[data-a="dataseed"]') as HTMLInputElement;
  const maxsteps = root.querySelector('[data-a="maxsteps"]') as HTMLInputElement;
  const plateaueps = root.querySelector('[data-a="plateaueps"]') as HTMLInputElement;
  runpause.textContent = s.mode === 'running' ? '⏸ Pause' : '▶ Run';
  // the session is done (all trajectories played out) — nothing left to run
  runpause.disabled = s.mode === 'done';
  // Save enabled only once the session is done (ARCHITECTURE.md: convergence enables Save)
  save.disabled = s.mode !== 'done';
  // reflect state without clobbering an input the user is editing
  if (document.activeElement !== figseed) figseed.value = String(s.figureSeed);
  if (document.activeElement !== dataseed) dataseed.value = String(s.dataSeed);
  if (document.activeElement !== maxsteps) maxsteps.value = String(s.maxSteps);
  if (document.activeElement !== plateaueps) plateaueps.value = String(s.plateauRelEps);
}
