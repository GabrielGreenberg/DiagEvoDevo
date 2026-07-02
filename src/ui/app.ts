// src/ui/app.ts
//
// Wires the store, the panels, and the Session (via the v2 SESSION API CONTRACT in ./sessionApi —
// the ONLY optimizer surface the UI touches) to requestAnimationFrame. Split of cadences:
//   • canvas + trajectory strip + score panel re-render EVERY frame (the figures move continuously),
//   • data panel + controls re-render only on STRUCTURAL changes (new seed, mode) via store notify.
// The run loop advances the session `stepsPerFrame` steps per frame (each step advances every active
// trajectory) and flips to 'done' when the session finishes (all trajectories played out), which
// enables Save. The main canvas follows session.best() through a FIXED viewport (base box + margin,
// expand-only) — no per-frame refit, so the frame no longer appears to move.

import { config } from '../config';
import { seedToDataSet } from '../core/data';
import { frameFromConfig } from '../core/frame';
import { createSession } from '../optim/session';
import { saveResult, loadLatest } from '../persistence/store';
import { createStore, type AppState } from './store';
import type { SessionApi, SessionFactory } from './sessionApi';
import { createViewport, updateViewport, renderCanvas, type Viewport } from './canvas';
import { createTrajStripState, renderTrajStrip } from './trajStrip';
import { renderDataPanel } from './dataPanel';
import { renderScorePanel } from './scorePanel';
import { mountControls, updateControls, type ControlCallbacks } from './controls';

const randomSeed = (): number => Math.floor(Math.random() * 1_000_000) + 1;

// The production factory: src/optim/session implements the contract (optimizer-v2 pass) — the
// Session class satisfies SessionApi structurally, no cast needed.
const defaultFactory: SessionFactory = (figureSeed, dataSeed) => createSession(figureSeed, dataSeed);

export function startApp(root: HTMLElement, makeSession: SessionFactory = defaultFactory): void {
  root.innerHTML = `
    <header class="topbar">
      <div class="title">Diagram Evolver <span class="muted">— random segments → a faithful diagram, by score alone</span></div>
      <div class="controls" id="controls"></div>
    </header>
    <main class="main">
      <section class="figpane">
        <canvas id="figcanvas"></canvas>
        <div class="trajstrip" id="trajstrip"></div>
        <div class="caption muted" id="figcaption"></div>
      </section>
      <aside class="sidepane">
        <div class="panel datapanel" id="datapanel"></div>
        <div class="panel scorepanel" id="scorepanel"></div>
      </aside>
    </main>`;

  const canvas = root.querySelector('#figcanvas') as HTMLCanvasElement;
  const stripRoot = root.querySelector('#trajstrip') as HTMLElement;
  const controlsRoot = root.querySelector('#controls') as HTMLElement;
  const dataRoot = root.querySelector('#datapanel') as HTMLElement;
  const scoreRoot = root.querySelector('#scorepanel') as HTMLElement;
  const caption = root.querySelector('#figcaption') as HTMLElement;

  // per-run render state: the fixed main viewport + the strip's per-slot viewports
  let mainView: Viewport = createViewport();
  let stripState = createTrajStripState();
  let liveData = seedToDataSet(config.seeds.data); // the dataset the live session targets
  const posited = frameFromConfig();

  const store = createStore({
    session: makeSession(config.seeds.figure, config.seeds.data),
    figureSeed: config.seeds.figure,
    dataSeed: config.seeds.data,
    mode: 'idle',
    tick: 0,
    maxSteps: config.converge.maxSteps, // contract: the session starts at this cap
    loaded: null,
    saveCount: 0,
  });

  /** Fresh session for (possibly new) seeds. maxSteps PERSISTS across Reset / new-seed (spec). */
  function newSession(figureSeed: number, dataSeed: number): void {
    const maxSteps = store.get().maxSteps;
    const session = makeSession(figureSeed, dataSeed);
    session.setMaxSteps(maxSteps);
    mainView = createViewport();
    stripState = createTrajStripState();
    liveData = seedToDataSet(dataSeed);
    store.set({ session, figureSeed, dataSeed, mode: 'idle', loaded: null });
    renderFrame();
  }

  /** UI mode derived from the session after stepping / cap changes. */
  function modeFor(session: SessionApi, fallback: AppState['mode']): AppState['mode'] {
    return session.status === 'done' ? 'done' : fallback;
  }

  const cb: ControlCallbacks = {
    onNewFigureSeed: () => newSession(randomSeed(), store.get().dataSeed),
    onNewDataSeed: () => newSession(store.get().figureSeed, randomSeed()),
    onEditFigureSeed: (v) => newSession(Math.trunc(v) || 1, store.get().dataSeed),
    onEditDataSeed: (v) => newSession(store.get().figureSeed, Math.trunc(v) || 1),
    onEditMaxSteps: (v) => {
      const s = store.get();
      s.session.setMaxSteps(v); // live: raising un-caps capped trajectories, lowering caps running ones
      // a done session may come back to life when the cap rises; resume paused, not auto-running
      const mode = s.mode === 'done' && s.session.status === 'running' ? 'paused' : modeFor(s.session, s.mode);
      store.set({ maxSteps: v, mode });
    },
    onRun: () => {
      const s = store.get();
      if (s.session.status !== 'done') store.set({ mode: 'running', loaded: null });
    },
    onPause: () => store.set({ mode: 'paused' }),
    onStep: () => {
      const s = store.get();
      if (s.loaded || s.session.status === 'done') return;
      s.session.step();
      store.set({ mode: modeFor(s.session, 'paused') });
      renderFrame();
    },
    // Reset = a brand-new session on the SAME seeds (fresh trajectories, fresh viewports)
    onReset: () => newSession(store.get().figureSeed, store.get().dataSeed),
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
    renderDataPanel(dataRoot, s.loaded ? s.loaded.data : liveData);
    updateControls(controlsRoot, s);
    caption.textContent = s.loaded
      ? `Loaded — figure seed ${s.loaded.figureSeed}, data seed ${s.loaded.dataSeed}, ${s.loaded.steps} steps${s.loaded.convergedByCap ? ' (by cap)' : ''}`
      : `figure seed ${s.figureSeed} · data seed ${s.dataSeed} · max ${s.maxSteps} steps/trajectory`;
  });

  /** Live status line: overall mode + per-trajectory converged/capped counts (spec: byCap live). */
  function statusLine(s: Readonly<AppState>): { text: string; steps: number } {
    const trajs = s.session.trajectories();
    const steps = trajs.reduce((mx, t) => Math.max(mx, t.steps), 0);
    const n = (st: string): number => trajs.filter((t) => t.status === st).length;
    const parts: string[] = [s.session.status === 'done' ? 'done' : s.mode];
    if (n('running') > 0) parts.push(`${n('running')} live`);
    if (n('plateaued') > 0) parts.push(`${n('plateaued')} converged`);
    if (n('capped') > 0) parts.push(`${n('capped')} capped`);
    return { text: parts.join(' · '), steps };
  }

  function renderFrame(): void {
    const s = store.get();
    if (s.loaded) {
      // a loaded result is static: snap a fresh fixed viewport around it once per render
      const view = updateViewport(createViewport(), s.loaded.figure, posited, 1);
      renderCanvas(canvas, s.loaded.figure, view, { labels: s.loaded.data.labels, frame: posited });
      stripRoot.innerHTML = '';
      renderScorePanel(scoreRoot, { breakdown: s.loaded.score, steps: s.loaded.steps, status: 'loaded' });
      return;
    }
    const best = s.session.best();
    updateViewport(mainView, best.figure, posited); // expand-only lerp; never refits
    renderCanvas(canvas, best.figure, mainView, { labels: liveData.labels, frame: posited });
    renderTrajStrip(stripRoot, s.session.trajectories(), stripState);
    const st = statusLine(s);
    renderScorePanel(scoreRoot, { breakdown: best.breakdown, steps: st.steps, status: st.text });
  }

  function loop(): void {
    if (!root.isConnected) return; // app torn down (root removed) — stop the rAF loop
    const s = store.get();
    if (s.mode === 'running' && !s.loaded) {
      const session = s.session;
      for (let i = 0; i < config.stepsPerFrame && session.status !== 'done'; i++) session.step();
      if (session.status === 'done') store.set({ mode: 'done' }); // enables Save
      // update the caption's live step count without rebuilding the data panel every frame
      const st = statusLine(s);
      caption.textContent = `figure seed ${s.figureSeed} · data seed ${s.dataSeed} · step ${st.steps} · max ${s.maxSteps}`;
    }
    renderFrame();
    requestAnimationFrame(loop);
  }

  store.set({}); // first structural render
  renderFrame();
  requestAnimationFrame(loop);
}
