// src/ui/app.ts
//
// Wires the store, the panels, and the Session to requestAnimationFrame. Split of cadences:
//   • the canvas + score panel re-render EVERY frame (cheap; the figure moves continuously),
//   • the data panel + controls re-render only on STRUCTURAL changes (new seed, mode) via store notify.
// The run loop advances the session `stepsPerFrame` inner steps per frame and flips to 'converged' when
// the plateau detector fires (which enables Save).

import { config } from '../config';
import { frameFromConfig } from '../core/frame';
import { createSession } from '../optim/session';
import { saveResult, loadLatest } from '../persistence/store';
import { createStore, type AppState } from './store';
import { renderCanvas } from './canvas';
import { renderDataPanel } from './dataPanel';
import { renderScorePanel } from './scorePanel';
import { mountControls, updateControls, type ControlCallbacks } from './controls';

const randomSeed = (): number => Math.floor(Math.random() * 1_000_000) + 1;

export function startApp(root: HTMLElement): void {
  root.innerHTML = `
    <header class="topbar">
      <div class="title">Diagram Evolver <span class="muted">— random segments → a faithful bar chart, by score alone</span></div>
      <div class="controls" id="controls"></div>
    </header>
    <main class="main">
      <section class="figpane">
        <canvas id="figcanvas"></canvas>
        <div class="caption muted" id="figcaption"></div>
      </section>
      <aside class="sidepane">
        <div class="panel datapanel" id="datapanel"></div>
        <div class="panel scorepanel" id="scorepanel"></div>
      </aside>
    </main>`;

  const canvas = root.querySelector('#figcanvas') as HTMLCanvasElement;
  const controlsRoot = root.querySelector('#controls') as HTMLElement;
  const dataRoot = root.querySelector('#datapanel') as HTMLElement;
  const scoreRoot = root.querySelector('#scorepanel') as HTMLElement;
  const caption = root.querySelector('#figcaption') as HTMLElement;

  const store = createStore({
    session: createSession(config.seeds.figure, config.seeds.data),
    figureSeed: config.seeds.figure,
    dataSeed: config.seeds.data,
    mode: 'idle',
    tick: 0,
    loaded: null,
    saveCount: 0,
  });

  function newSession(figureSeed: number, dataSeed: number): void {
    store.set({
      session: createSession(figureSeed, dataSeed),
      figureSeed,
      dataSeed,
      mode: 'idle',
      loaded: null,
    });
    renderFrame();
  }

  const cb: ControlCallbacks = {
    onNewFigureSeed: () => newSession(randomSeed(), store.get().dataSeed),
    onNewDataSeed: () => newSession(store.get().figureSeed, randomSeed()),
    onEditFigureSeed: (v) => newSession(Math.trunc(v) || 1, store.get().dataSeed),
    onEditDataSeed: (v) => newSession(store.get().figureSeed, Math.trunc(v) || 1),
    onRun: () => store.set({ mode: 'running', loaded: null }),
    onPause: () => store.set({ mode: 'paused' }),
    onStep: () => {
      const s = store.get();
      if (s.loaded) return;
      s.session.step();
      store.set({ mode: s.session.status === 'converged' ? 'converged' : 'paused' });
      renderFrame();
    },
    onReset: () => {
      store.get().session.reset();
      store.set({ mode: 'idle', loaded: null });
      renderFrame();
    },
    onSave: () => store.set({ saveCount: saveResult(store.get().session.result()) }),
    onLoad: () => {
      const r = loadLatest();
      if (r) {
        store.set({ loaded: r, mode: 'idle' });
        renderFrame();
      }
    },
  };

  mountControls(controlsRoot, cb);

  // structural render (only on notify: new seed, mode change, load)
  store.subscribe((s: AppState) => {
    renderDataPanel(dataRoot, s.loaded ? s.loaded.data : s.session.data);
    updateControls(controlsRoot, s);
    caption.textContent = s.loaded
      ? `Loaded — figure seed ${s.loaded.figureSeed}, data seed ${s.loaded.dataSeed}, ${s.loaded.steps} steps${s.loaded.convergedByCap ? ' (by cap)' : ''}`
      : `figure seed ${s.figureSeed} · data seed ${s.dataSeed} · ${s.session.steps} steps`;
  });

  const posited = frameFromConfig();
  function renderFrame(): void {
    const s = store.get();
    if (s.loaded) {
      renderCanvas(canvas, s.loaded.figure, s.loaded.data.labels, posited);
      renderScorePanel(scoreRoot, {
        breakdown: s.loaded.score,
        steps: s.loaded.steps,
        temperature: 0,
        mode: 'loaded',
      });
      return;
    }
    renderCanvas(canvas, s.session.figure, s.session.data.labels, posited);
    renderScorePanel(scoreRoot, {
      breakdown: s.session.breakdown(),
      steps: s.session.steps,
      temperature: s.session.temperature(),
      mode: s.mode,
    });
  }

  function loop(): void {
    const s = store.get();
    if (s.mode === 'running' && !s.loaded) {
      const session = s.session;
      for (let i = 0; i < config.stepsPerFrame && session.status !== 'converged'; i++) session.step();
      if (session.status === 'converged') store.set({ mode: 'converged' }); // enables Save
      // update the caption's live step count without rebuilding the data panel every frame
      caption.textContent = `figure seed ${s.figureSeed} · data seed ${s.dataSeed} · ${session.steps} steps`;
    }
    renderFrame();
    requestAnimationFrame(loop);
  }

  store.set({}); // first structural render
  renderFrame();
  requestAnimationFrame(loop);
}
