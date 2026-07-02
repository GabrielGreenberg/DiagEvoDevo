// src/ui/app.ts
//
// Wires the store, the panels, and the Session (via the SESSION API CONTRACT in ./sessionApi —
// the ONLY optimizer surface the UI touches) to requestAnimationFrame. Split of cadences:
//   • canvas + gallery + score panel re-render EVERY frame (the figures move continuously),
//   • data panel + controls re-render only on STRUCTURAL changes (new seed, mode) via store notify.
//
// Display policy (UI feedback pass):
//   • STICKY SELECTION — the main canvas and score panel show ONE trajectory, chosen by stable id.
//     Default: the session's first trajectory. It changes ONLY on a thumbnail click; it never
//     auto-switches (not on overtake, not on finish, not on slot restart). session.best() is NOT
//     on the display path; the gallery's subtle "best" marker may move, the selection may not.
//   • PERSISTENT RESULTS — when the session reaches 'done' nothing is cleared or replaced; the
//     canvas, score panel, gallery, and captions freeze as they ended until Reset / new seed.
//   • PERSISTENT maxSteps AND plateauRelEps — both live in localStorage (persistence/prefs):
//     stored value > config default, surviving Reset, new seeds, and page reloads.
//   • CARRIER TOGGLES (readings strip) — the pending disabled set persists in prefs like maxSteps
//     but applies at the NEXT session only: newSession composes {...config, carriers: {disabled}}
//     for session construction, while the panel/chips read the LIVE objective from the SESSION's
//     snapshotted cfg, so the display never lies about the running objective.
//   • Save persists the SELECTED trajectory (result(selectedId)), i.e. what the user is looking at.

import { config, type Config } from '../config';
import { seedToDataSet } from '../core/data';
import { frameFromConfig } from '../core/frame';
import { canonicalDisabledIds } from '../core/measurements/registry';
import { createSession } from '../optim/session';
import { saveResult, loadLatest } from '../persistence/store';
import {
  loadMaxSteps,
  saveMaxSteps,
  loadPlateauRelEps,
  savePlateauRelEps,
  loadDisabledCarriers,
  saveDisabledCarriers,
} from '../persistence/prefs';
import { createStore, type AppState } from './store';
import type { SessionApi, SessionFactory } from './sessionApi';
import { createViewport, updateViewport, renderCanvas, type Viewport } from './canvas';
import { createTrajStripState, renderTrajStrip } from './trajStrip';
import { renderDataPanel } from './dataPanel';
import { renderScorePanel } from './scorePanel';
import { mountControls, updateControls, type ControlCallbacks } from './controls';
import { mountCarrierStrip, updateCarrierStrip } from './carrierStrip';

const randomSeed = (): number => Math.floor(Math.random() * 1_000_000) + 1;

// The production factory: src/optim/session implements the contract — the Session class satisfies
// SessionApi structurally, no cast needed.
const defaultFactory: SessionFactory = (figureSeed, dataSeed, cfg) =>
  createSession(figureSeed, dataSeed, cfg);

/** The per-session config: base config plus the pending carrier toggles (sessions snapshot it). */
function sessionCfg(disabled: readonly string[]): Config {
  return { ...config, carriers: { disabled: [...disabled] } };
}

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
        <div class="panel readingspanel" id="readingspanel"></div>
        <div class="panel scorepanel" id="scorepanel"></div>
      </aside>
    </main>`;

  const canvas = root.querySelector('#figcanvas') as HTMLCanvasElement;
  const stripRoot = root.querySelector('#trajstrip') as HTMLElement;
  const controlsRoot = root.querySelector('#controls') as HTMLElement;
  const dataRoot = root.querySelector('#datapanel') as HTMLElement;
  const readingsRoot = root.querySelector('#readingspanel') as HTMLElement;
  const scoreRoot = root.querySelector('#scorepanel') as HTMLElement;
  const caption = root.querySelector('#figcaption') as HTMLElement;

  // per-run render state: the fixed main viewport + the gallery's per-trajectory viewports
  let mainView: Viewport = createViewport();
  let stripState = createTrajStripState();
  let liveData = seedToDataSet(config.seeds.data); // the dataset the live session targets
  const posited = frameFromConfig();

  // maxSteps / plateauRelEps / disabled-readings precedence: localStorage > config default.
  const initialMaxSteps = loadMaxSteps() ?? config.converge.maxSteps;
  const initialPlateauRelEps = loadPlateauRelEps() ?? config.converge.plateauRelEps;
  // Canonicalize at the boundary (registry.canonicalDisabledIds): stored/config ids may be
  // merged-away ALIASES (the census filter is lenient) or stale garbage — the strip keys chips by
  // canonical id, so the pending set must be canonical or the chips would lie about the census.
  const initialDisabled = canonicalDisabledIds(loadDisabledCarriers() ?? config.carriers.disabled);
  const initialSession = makeSession(config.seeds.figure, config.seeds.data, sessionCfg(initialDisabled));
  if (initialMaxSteps !== config.converge.maxSteps) initialSession.setMaxSteps(initialMaxSteps);
  if (initialPlateauRelEps !== config.converge.plateauRelEps) {
    initialSession.setPlateauRelEps(initialPlateauRelEps);
  }

  const store = createStore({
    session: initialSession,
    figureSeed: config.seeds.figure,
    dataSeed: config.seeds.data,
    mode: 'idle',
    tick: 0,
    maxSteps: initialMaxSteps,
    plateauRelEps: initialPlateauRelEps,
    disabledCarriers: initialDisabled,
    selectedId: firstId(initialSession), // sticky selection defaults to the first trajectory
    loaded: null,
    saveCount: 0,
  });

  /** The session's first trajectory (slot 0) — the default sticky selection. */
  function firstId(session: SessionApi): number {
    return session.trajectories()[0]?.id ?? 0;
  }

  /** Fresh session for (possibly new) seeds. This is the ONLY full display clear (explicit Reset /
   *  seed change); maxSteps, plateauRelEps AND the carrier toggles PERSIST across it (store +
   *  localStorage) — this is also where pending toggles finally BITE (snapshotted into the cfg). */
  function newSession(figureSeed: number, dataSeed: number): void {
    const { maxSteps, plateauRelEps, disabledCarriers } = store.get();
    const session = makeSession(figureSeed, dataSeed, sessionCfg(disabledCarriers));
    session.setMaxSteps(maxSteps);
    session.setPlateauRelEps(plateauRelEps);
    mainView = createViewport();
    stripState = createTrajStripState();
    liveData = seedToDataSet(dataSeed);
    store.set({ session, figureSeed, dataSeed, mode: 'idle', selectedId: firstId(session), loaded: null });
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
      saveMaxSteps(v); // persist FIRST: the cap survives Reset, new seeds, and reloads
      s.session.setMaxSteps(v); // live: raising un-caps capped trajectories, lowering caps running ones
      // a done session may come back to life when the cap rises; resume paused, not auto-running
      const mode = s.mode === 'done' && s.session.status === 'running' ? 'paused' : modeFor(s.session, s.mode);
      store.set({ maxSteps: v, mode });
    },
    onEditPlateauRelEps: (v) => {
      const s = store.get();
      savePlateauRelEps(v); // persist FIRST: survives Reset, new seeds, and reloads
      // live: running trajectories use the new strictness on their next plateau check; finished
      // endpoints are NEVER retroactively un-converged (session contract), so mode is untouched
      s.session.setPlateauRelEps(v);
      store.set({ plateauRelEps: v });
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
    // Save persists the SELECTED trajectory — what the main canvas/score panel show — not best().
    onSave: () => {
      const s = store.get();
      store.set({ saveCount: saveResult(s.session.result(s.selectedId)) });
    },
    onLoad: () => {
      const r = loadLatest();
      if (r) {
        store.set({ loaded: r, mode: 'idle' });
        renderFrame();
      }
    },
  };

  mountControls(controlsRoot, cb);

  // READINGS strip: toggles persist immediately (prefs) but bite at the NEXT session only —
  // the live session's cfg is a construction-time snapshot (spec: carrier toggles).
  mountCarrierStrip(readingsRoot, {
    onToggleCarrier: (id) => {
      const cur = store.get().disabledCarriers;
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      saveDisabledCarriers(next); // persist FIRST: survives Reset, new seeds, and reloads
      store.set({ disabledCarriers: next }); // pending only — the live session is untouched
    },
  });

  // Sticky selection: the ONLY place selectedId changes besides newSession — a thumbnail click.
  stripRoot.addEventListener('click', (e) => {
    const cell = (e.target as HTMLElement).closest('.traj') as HTMLElement | null;
    if (!cell || store.get().loaded) return;
    const id = Number(cell.dataset.id);
    if (!Number.isFinite(id) || id === store.get().selectedId) return;
    mainView = createViewport(); // re-frame the main canvas around the newly selected figure
    store.set({ selectedId: id });
    renderFrame();
  });

  // structural render (only on notify: new seed, mode change, selection, toggle, load)
  store.subscribe((s: AppState) => {
    renderDataPanel(dataRoot, s.loaded ? s.loaded.data : liveData);
    updateControls(controlsRoot, s);
    // pending = the stored toggle set; live = the SESSION's snapshotted cfg (never the pending
    // one), so the strip's pending marks/hint are honest about the running objective
    updateCarrierStrip(readingsRoot, {
      pendingDisabled: new Set(s.disabledCarriers),
      liveDisabled: new Set(s.session.cfg.carriers?.disabled ?? []),
    });
    caption.textContent = s.loaded
      ? `Loaded — figure seed ${s.loaded.figureSeed}, data seed ${s.loaded.dataSeed}, ${s.loaded.steps} steps${s.loaded.convergedByCap ? ' (by cap)' : ''}`
      : liveCaption(s); // same live caption at every mode — nothing is cleared at 'done'
  });

  /** The live caption (also frozen as-is at 'done' — persistent-results spec). */
  function liveCaption(s: Readonly<AppState>): string {
    return `figure seed ${s.figureSeed} · data seed ${s.dataSeed} · step ${statusLine(s).steps} · max ${s.maxSteps} steps/trajectory`;
  }

  /** Live status line over ALL trajectories: overall mode + per-status counts. */
  function statusLine(s: Readonly<AppState>): { text: string; steps: number } {
    const trajs = s.session.allTrajectories();
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
    // STICKY selection drives the display: session.best() is deliberately absent here.
    const all = s.session.allTrajectories();
    const sel = s.session.detail(s.selectedId) ?? s.session.detail(all[0]?.id ?? 0);
    if (sel) {
      updateViewport(mainView, sel.figure, posited); // expand-only lerp; never refits
      renderCanvas(canvas, sel.figure, mainView, { labels: liveData.labels, frame: posited });
      const st = statusLine(s);
      renderScorePanel(scoreRoot, { breakdown: sel.breakdown, steps: st.steps, status: st.text });
    }
    renderTrajStrip(stripRoot, all, stripState, s.selectedId);
  }

  function loop(): void {
    if (!root.isConnected) return; // app torn down (root removed) — stop the rAF loop
    const s = store.get();
    if (s.mode === 'running' && !s.loaded) {
      const session = s.session;
      for (let i = 0; i < config.stepsPerFrame && session.status !== 'done'; i++) session.step();
      if (session.status === 'done') store.set({ mode: 'done' }); // enables Save; display is untouched
      // update the caption's live step count without rebuilding the data panel every frame
      caption.textContent = liveCaption(s);
    }
    renderFrame();
    requestAnimationFrame(loop);
  }

  store.set({}); // first structural render
  renderFrame();
  requestAnimationFrame(loop);
}
