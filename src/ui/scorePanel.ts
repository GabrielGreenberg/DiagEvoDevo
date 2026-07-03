// src/ui/scorePanel.ts
//
// The live score readout for the v2 objective (scoring-v2 design §UI v2). Per data relation: the
// LSE-aggregated relation score, and per DISTINCT carrier a row with its plain-English label, a
// salience chip (dim below the legibility gate), per-rung mini-bars (τ signed ↑/↓, r², ratio), and
// the salience-gated cell q. Headline quality is honest (≈0 for random figures — chance floors are
// removed at the source). The data-ink penalty (and any other registered penalty with weight > 0)
// gets its own row; the COINCIDENCE BONUS (config.bonuses.coincidence) gets a matching row (mode
// + value + weight, e.g. "coincidence bonus (strong) · w 0.2 · +0.21") when the term is active,
// and each relation lists its top coincident pairs ("end y ≡ length 1.00" — arranged equality,
// Breakdown.bonuses.pairs; in STRONG mode path-bearing pairs append their ink-path overlap:
// "end y ≡ length 1.00 · ink 0.98"). Reads ONLY the v2
// Breakdown fields — no deprecated v1 aliases. Stale persisted breakdowns (saved before the bonus
// existed) may lack `bonuses`; every access is defensive so Load never breaks the panel.

import type { Breakdown, CarrierScore } from '../core/score';
import type { RungExact } from '../core/fidelity/rungs';

export interface ScorePanelData {
  breakdown: Breakdown;
  steps: number;
  /** Composed live status line, e.g. "running · 1 plateaued · 2 capped" or "converged". */
  status: string;
  /** The coincidence weight of the cfg this breakdown was scored under (session.cfg /
   *  configSnapshot) — display only, shown on the bonus row like the penalty rows' weights.
   *  The bonus VALUE itself lives in breakdown.bonuses. */
  coincidenceWeight: number;
  /** The coincidence MODE of that same cfg ('weak' same-magnitude | 'strong' same-ink-path,
   *  CONCEPT §7) — shown on the bonus row so the panel names the objective actually running.
   *  Stale persisted snapshots (pre-mode saves) read as 'weak', the only formula they had. */
  coincidenceMode: 'weak' | 'strong';
}

// Display thresholds (spec §UI v2; presentation only — the score itself is untouched by these).
const TOP_K = 6; // carriers shown per relation (of the full distinct set)
const MATCH = 0.9; // a carrier "tracks" a relation when its cell q ≥ this
const DIM_SALIENCE = 0.5; // rows below this salience render dimmed (sub-legible carriers)

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** One rung's mini-bar. Ordinal shows the SIGNED τ direction (↑ with, ↓ against the data). */
function rungBar(r: RungExact, signedTau: number): string {
  const f = Math.max(0, Math.min(1, r.f));
  const txt =
    r.name === 'ord'
      ? `τ${signedTau >= 0 ? '↑' : '↓'}${Math.abs(signedTau).toFixed(2)}`
      : r.name === 'int'
        ? `r²${r.f.toFixed(2)}`
        : `∝${r.f.toFixed(2)}`;
  return `<span class="minibar" title="${r.name} rung fidelity">
    <span class="minifill rung-${r.name}" style="width:${(100 * f).toFixed(1)}%"></span>
    <span class="minitxt">${txt}</span>
  </span>`;
}

function carrierRow(m: CarrierScore): string {
  const dim = m.salience < DIM_SALIENCE ? ' dim' : '';
  const badge =
    m.aliases.length > 0
      ? `<span class="cbadge" title="reads the same under the page and the posited frame (merged duplicate cells)">page+frame</span>`
      : '';
  return `<div class="crow${dim}">
    <span class="cname">${esc(m.label)}${badge}</span>
    <span class="salchip" title="salience — the reader-resolution gate">${m.salience.toFixed(2)}</span>
    <span class="rungbars">${m.rungs.map((r) => rungBar(r, m.signedTau)).join('')}</span>
    <span class="cq" title="salience-gated cell q">${m.q.toFixed(2)}</span>
  </div>`;
}

/** A relation's "coincident:" line — its top pairs (Breakdown.bonuses.pairs, already truncated
 *  and sorted by the core) as "aLabel ≡ bLabel eq". A pair carrying a STRONG-mode ink-path
 *  overlap (CoincidencePair.overlap — present exactly on strong path-bearing pairs) appends it:
 *  "end y ≡ length 1.00 · ink 0.98". Empty string when the relation has none. */
function coincidentLine(
  pairs: readonly { aLabel: string; bLabel: string; eq: number; overlap?: number }[],
): string {
  if (pairs.length === 0) return '';
  const items = pairs
    .map(
      (p) =>
        `${esc(p.aLabel)} ≡ ${esc(p.bLabel)} ${p.eq.toFixed(2)}` +
        (p.overlap !== undefined ? ` · ink ${p.overlap.toFixed(2)}` : ''),
    )
    .join(' · ');
  return `<div class="coinline muted" title="coincident pairs — the figure ARRANGES these readings to return the same number in the same page units (equality kernel shown; 'ink' = strong-mode measurement-path overlap × visible-extent gate)">coincident: ${items}</div>`;
}

export function renderScorePanel(root: HTMLElement, d: ScorePanelData): void {
  const b = d.breakdown;
  // Defensive: breakdowns persisted before the coincidence term lack `bonuses` (stale Load data).
  const bonuses = b.bonuses ?? { coincidence: 0, relationCoin: [], pairs: [] };

  // "N tracking" = DISTINCT carriers with q ≥ MATCH in at least one relation.
  const trackingIds = new Set<string>();
  for (const rel of b.relations)
    for (const m of rel.carriers) if (m.q >= MATCH) trackingIds.add(m.id);

  const sections = b.relations
    .map((rel) => {
      const nMatch = rel.carriers.filter((m) => m.q >= MATCH).length;
      const rows = rel.carriers.slice(0, TOP_K).map(carrierRow).join('');
      return `<div class="assign">
        <div class="ahead"><b>${rel.key}</b> (${rel.dataType})
          <span class="muted">${rel.carriers.length} commensurable</span>
          <span class="areward" title="LSE-aggregated relation score">${(100 * rel.aggregated).toFixed(0)}%</span></div>
        <div class="matchline muted">${nMatch} tracking (q ≥ ${MATCH}) · top ${Math.min(TOP_K, rel.carriers.length)} shown</div>
        ${rows}
        ${coincidentLine(bonuses.pairs.filter((p) => p.key === rel.key))}
      </div>`;
    })
    .join('');

  // Active ⇔ the core computed the term (relationCoin is empty exactly when the weight is 0).
  const bonusRow =
    bonuses.relationCoin.length > 0
      ? `<div class="penrow bonusrow"><span class="pname">coincidence bonus (${d.coincidenceMode})</span>
         <span class="muted">w ${d.coincidenceWeight}</span>
         <span class="bval">+${bonuses.coincidence.toFixed(3)}</span></div>`
      : '';

  const penaltyRows = b.penalties
    .filter((p) => p.weight > 0)
    .map(
      (p) =>
        `<div class="penrow"><span class="pname">${p.name === 'spuriousness' ? 'data-ink penalty' : p.name}</span>
         <span class="muted">w ${p.weight}</span>
         <span class="pval">−${p.weighted.toFixed(3)}</span></div>`,
    )
    .join('');

  root.innerHTML = `<h3>Score <span class="muted">homomorphism of ⟨order × value⟩ — per-relation smooth-max (LSE)</span></h3>
    <div class="scoretop">
      <div class="bignum"><span class="biglabel">quality</span><span class="bigval">${(100 * b.quality).toFixed(0)}%</span></div>
      <div class="bignum"><span class="biglabel">tracking</span><span class="bigval">${trackingIds.size}/${b.distinctCarriers}</span></div>
      <div class="bignum"><span class="biglabel">total</span><span class="bigval">${b.total.toFixed(3)}</span></div>
    </div>
    <div class="qualtrack"><span class="qualbar" style="width:${(100 * Math.max(0, Math.min(1, b.quality))).toFixed(1)}%"></span></div>
    <div class="comphdr muted">${b.distinctCarriers} distinct carriers (census ${b.censusSize}); dim rows are below reader resolution</div>
    ${sections}
    ${bonusRow}
    ${penaltyRows}
    <div class="statusrow muted">step ${d.steps} · ${esc(d.status)}</div>`;
}
