// src/ui/scorePanel.ts
//
// The live score readout for the COMPREHENSIVE matrix (ARCHITECTURE.md GUI spec). Each data relation is
// compared to every commensurable measurement, like-with-like; the panel shows, per relation, the summed
// reward and the TOP measurements by fidelity — so the user watches which geometric relations come to
// track the data (the emergent structure). F_ord within a measurement is the exact (Kendall τ) form.

import type { Breakdown, MeasurementScore } from '../core/score';

export interface ScorePanelData {
  breakdown: Breakdown;
  steps: number;
  temperature: number;
  mode: string;
}

const TOP_K = 6;
const MATCH = 0.9; // a measurement "tracks" the data when its normalized fidelity ≥ this

/** Compact human label for a measurement id, e.g. 'page.displacement.magnitude' → 'disp mag'. */
function shortId(id: string): string {
  return id
    .replace('page.', '')
    .replace('frame.', 'f·')
    .replace('displacement', 'disp')
    .replace('midpoint', 'mid')
    .replace('projPar', '∥')
    .replace('projPerp', '⊥')
    .replace('magnitude', 'mag')
    .replace('angle', '∠')
    .replace(/\./g, ' ');
}

function measRow(m: MeasurementScore, maxRung: number): string {
  const frac = maxRung > 0 ? m.reward / maxRung : 0; // normalized fidelity ∈ [0,1]
  const cls = m.stamp === 'cyclic' ? 'rung-int' : 'rung-ratio';
  return `<div class="rrow">
    <span class="rname" title="${m.id}">${shortId(m.id)}</span>
    <span class="rtrack"><span class="rbar ${cls}" style="width:${(100 * frac).toFixed(1)}%"></span></span>
    <span class="rval">${frac.toFixed(2)}</span>
  </div>`;
}

export function renderScorePanel(root: HTMLElement, d: ScorePanelData): void {
  const b = d.breakdown;
  let matching = 0;
  let totalMeas = 0;

  const sections = b.relations
    .map((rel) => {
      const maxRung = rel.measurements.length ? rel.maxReward / rel.measurements.length : 1;
      totalMeas += rel.measurements.length;
      matching += rel.measurements.filter((m) => m.reward / maxRung >= MATCH).length;
      const top = rel.measurements.slice(0, TOP_K).map((m) => measRow(m, maxRung)).join('');
      const nMatch = rel.measurements.filter((m) => m.reward / maxRung >= MATCH).length;
      return `<div class="assign">
        <div class="ahead"><b>${rel.key}</b> (${rel.dataType})
          <span class="muted">${rel.measurements.length} commensurable</span>
          <span class="areward">${(100 * rel.normalized).toFixed(0)}% · ${rel.reward.toFixed(1)}/${rel.maxReward.toFixed(0)}</span></div>
        <div class="matchline muted">${nMatch} tracking (fidelity ≥ ${MATCH})</div>
        ${top}
      </div>`;
    })
    .join('');

  root.innerHTML = `<h3>Score <span class="muted">homomorphism of ⟨order × value⟩ — full matrix</span></h3>
    <div class="scoretop">
      <div class="bignum"><span class="biglabel">quality</span><span class="bigval">${(100 * b.quality).toFixed(0)}%</span></div>
      <div class="bignum"><span class="biglabel">tracking</span><span class="bigval">${matching}/${totalMeas}</span></div>
    </div>
    <div class="qualtrack"><span class="qualbar" style="width:${(100 * b.quality).toFixed(1)}%"></span></div>
    <div class="comphdr muted">each data relation vs ALL commensurable measurements, summed (top ${TOP_K} shown):</div>
    ${sections}
    <div class="statusrow muted">step ${d.steps} · T ${d.temperature.toFixed(2)} · ${d.mode}</div>`;
}
