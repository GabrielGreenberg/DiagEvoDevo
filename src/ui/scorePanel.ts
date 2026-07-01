// src/ui/scorePanel.ts
//
// The live score readout (ARCHITECTURE.md GUI spec): total, quality, and the per-assignment rung
// breakdown (F_ord/F_int/F_ratio for the sales carrier, F_ord for the order carrier) — updating live so
// the user watches the terms fight and settle. F_ord is shown as the EXACT (Kendall τ) form, labelled;
// the optimizer sees the smooth surrogate, so this is the one sanctioned display/optimize value fork.

import type { Breakdown } from '../core/score';

export interface ScorePanelData {
  breakdown: Breakdown;
  steps: number;
  temperature: number;
  mode: string;
}

const FRIENDLY: Record<string, string> = {
  'page.displacement.magnitude': 'length',
  'page.start.projPar': 'x-position',
  'frame.end.projPar': 'height-vs-baseline',
};

const pct = (f: number): string => `${(100 * f).toFixed(0)}%`;

function rungRow(name: string, f: number): string {
  const label = name === 'ord' ? 'F_ord (exact)' : name === 'int' ? 'F_int' : 'F_ratio';
  const cls = `rung-${name}`;
  return `<div class="rrow">
    <span class="rname">${label}</span>
    <span class="rtrack"><span class="rbar ${cls}" style="width:${(100 * f).toFixed(1)}%"></span></span>
    <span class="rval">${f.toFixed(3)}</span>
  </div>`;
}

export function renderScorePanel(root: HTMLElement, d: ScorePanelData): void {
  const b = d.breakdown;
  const assignments = b.assignments
    .map((a) => {
      const carrier = FRIENDLY[a.measurementId] ?? a.measurementId;
      const maxR = a.key === 'sales' ? 7 : 1;
      return `<div class="assign">
        <div class="ahead"><b>${a.key}</b> → ${carrier}
          <span class="muted">${a.measurementId}</span>
          <span class="areward">${a.reward.toFixed(2)} / ${maxR.toFixed(2)}</span></div>
        ${a.rungs.map((r) => rungRow(r.name, r.f)).join('')}
      </div>`;
    })
    .join('');
  const penalties = b.penalties
    .map((p) => `${p.name}: ${p.value.toFixed(3)}×${p.weight}`)
    .join(' · ');

  root.innerHTML = `<h3>Score <span class="muted">S = reward − Σpenalty</span></h3>
    <div class="scoretop">
      <div class="bignum"><span class="biglabel">quality</span><span class="bigval">${pct(b.quality)}</span></div>
      <div class="bignum"><span class="biglabel">total</span><span class="bigval">${b.total.toFixed(3)}</span></div>
    </div>
    <div class="qualtrack"><span class="qualbar" style="width:${(100 * b.quality).toFixed(1)}%"></span></div>
    ${assignments}
    <div class="penrow muted">penalties (off): ${penalties}</div>
    <div class="statusrow muted">step ${d.steps} · T ${d.temperature.toFixed(2)} · ${d.mode}</div>`;
}
