// @vitest-environment jsdom
//
// src/ui/scorePanel.test.ts — adversarial checks on the v2 score panel:
//  • plain-English labels only — NO ∥/⊥/∠ glyphs and no 'disp'/'mag' abbreviations anywhere,
//  • salience chip + dimming below the gate, ↑/↓ from signedTau, rung CSS classes used correctly,
//  • 'N tracking' counts DISTINCT carriers with q ≥ 0.9, data-ink penalty row, honest headline,
//  • live converged/capped status line,
//  • COINCIDENCE bonus row (value + weight, only when the term is active) and per-relation
//    "coincident:" pair lines ("aLabel ≡ bLabel eq") that never leak across relations.
// The breakdown is hand-built so every displayed branch is exercised deterministically; a second
// test feeds a REAL scoreExact breakdown to catch drift between the panel and core types.

import { describe, it, expect } from 'vitest';
import { renderScorePanel, type ScorePanelData } from './scorePanel';
import { ScaleType } from '../core/scale';
import { scoreExact, type Breakdown, type CarrierScore } from '../core/score';
import { goldenBarChart, wellSeparatedData } from '../core/fixtures';

/** Render helper: coincidenceWeight defaults to 0 (the fixture's disabled-term shape). */
function panel(root: HTMLElement, d: Omit<ScorePanelData, 'coincidenceWeight'> & { coincidenceWeight?: number }): void {
  renderScorePanel(root, { coincidenceWeight: 0, ...d });
}

function row(p: Partial<CarrierScore> & { id: string; label: string }): CarrierScore {
  return {
    stamp: ScaleType.Ratio,
    aliases: [],
    salience: 0.95,
    q: 0.95,
    signedTau: 0.93,
    rungs: [
      { name: 'ord', f: 0.93 },
      { name: 'int', f: 0.88 },
      { name: 'ratio', f: 0.91 },
    ],
    ...p,
  };
}

function fakeBreakdown(): Breakdown {
  const salesRows = [
    row({ id: 'page.displacement.magnitude', label: 'length', aliases: ['frame.displacement.magnitude'] }),
    row({ id: 'page.end.projPar', label: 'end x', signedTau: -0.9, q: 0.91 }),
    row({ id: 'page.start.projPerp', label: 'start y', salience: 0.12, q: 0.05 }), // sub-legible → dim
  ];
  const orderRows = [
    row({
      id: 'page.start.projPar',
      label: 'start x',
      stamp: ScaleType.Interval,
      q: 0.97,
      rungs: [{ name: 'ord', f: 0.97 }],
    }),
  ];
  const mk = (
    key: 'sales' | 'order',
    dataType: ScaleType,
    carriers: CarrierScore[],
    aggregated: number,
  ): Breakdown['relations'][number] => ({
    key,
    dataType,
    aggregated,
    carriers,
  });
  return {
    total: 1.62,
    reward: 1.72,
    penalty: 0.1,
    maxReward: 2,
    quality: 0.86,
    relations: [
      mk('sales', ScaleType.Ratio, salesRows, 0.94),
      mk('order', ScaleType.Ordinal, orderRows, 0.97),
    ],
    penalties: [
      { name: 'spuriousness', value: 0.2, weight: 0.5, weighted: 0.1 },
      { name: 'frozenDof', value: 0.4, weight: 0, weighted: 0 }, // weight 0 → hidden
    ],
    bonuses: { coincidence: 0, relationCoin: [], pairs: [] }, // disabled-term shape (core contract)
    distinctCarriers: 16,
    censusSize: 26,
  };
}

describe('score panel v2', () => {
  it('uses plain-English labels — no v1 glyphs or abbreviations anywhere in the DOM', () => {
    const root = document.createElement('div');
    panel(root, { breakdown: fakeBreakdown(), steps: 42, status: 'running' });
    const html = root.innerHTML;
    for (const banned of ['∥', '⊥', '∠', 'disp', 'mag', 'projPar', 'projPerp']) {
      expect(html).not.toContain(banned);
    }
    expect(html).toContain('length');
    expect(html).toContain('start x');
    expect(html).toContain('end x');
  });

  it('shows salience chips, dims sub-legible rows, and badges merged page+frame carriers', () => {
    const root = document.createElement('div');
    panel(root, { breakdown: fakeBreakdown(), steps: 1, status: 'running' });
    const rows = [...root.querySelectorAll('.crow')];
    expect(rows.length).toBe(4);
    const dim = rows.filter((r) => r.classList.contains('dim'));
    expect(dim.length).toBe(1);
    expect(dim[0]!.querySelector('.cname')!.textContent).toContain('start y');
    expect(dim[0]!.querySelector('.salchip')!.textContent).toBe('0.12');
    const badges = [...root.querySelectorAll('.cbadge')];
    expect(badges.length).toBe(1); // only the aliased carrier
    expect(badges[0]!.textContent).toBe('page+frame');
  });

  it('renders per-rung mini-bars with the right classes and signed τ arrows', () => {
    const root = document.createElement('div');
    panel(root, { breakdown: fakeBreakdown(), steps: 1, status: 'running' });
    const salesRow = [...root.querySelectorAll('.crow')][0]!; // length, signedTau +0.93
    expect(salesRow.querySelectorAll('.minifill.rung-ord').length).toBe(1);
    expect(salesRow.querySelectorAll('.minifill.rung-int').length).toBe(1);
    expect(salesRow.querySelectorAll('.minifill.rung-ratio').length).toBe(1);
    expect(salesRow.textContent).toContain('↑0.93');
    const reversed = [...root.querySelectorAll('.crow')][1]!; // end x, signedTau −0.9
    expect(reversed.textContent).toContain('↓0.90');
    // ordinal relation: exactly ONE rung bar (height-capped by the data)
    const orderRow = [...root.querySelectorAll('.crow')][3]!;
    expect(orderRow.querySelectorAll('.minibar').length).toBe(1);
    expect(orderRow.querySelectorAll('.minifill.rung-ord').length).toBe(1);
  });

  it('headline: honest quality, distinct-carrier tracking count, data-ink penalty row, status', () => {
    const root = document.createElement('div');
    panel(root, {
      breakdown: fakeBreakdown(),
      steps: 42,
      status: 'running · 1 converged · 2 capped',
    });
    expect(root.querySelector('.qualbar')!.getAttribute('style')).toContain('86.0%');
    // q ≥ 0.9 in any relation: length (.95), end x (.91), start x (.97) = 3 distinct of 16
    expect(root.textContent).toContain('3/16');
    // penalty rows: only weight > 0 terms, labeled data-ink
    const pens = [...root.querySelectorAll('.penrow')];
    expect(pens.length).toBe(1);
    expect(pens[0]!.textContent).toContain('data-ink penalty');
    expect(pens[0]!.textContent).toContain('−0.100');
    expect(root.querySelector('.statusrow')!.textContent).toContain('step 42');
    expect(root.querySelector('.statusrow')!.textContent).toContain('2 capped');
  });

  it('accepts a REAL scoreExact breakdown (no drift between panel and core types)', () => {
    const data = wellSeparatedData();
    const fig = goldenBarChart(data);
    const b = scoreExact(fig, data);
    const root = document.createElement('div');
    panel(root, { breakdown: b, steps: 0, status: 'idle' });
    expect(root.querySelectorAll('.crow').length).toBeGreaterThan(0);
    for (const banned of ['∥', '⊥', '∠', 'projPar', 'projPerp']) {
      expect(root.innerHTML).not.toContain(banned);
    }
    // the golden bar chart's headline is honest and high
    expect(b.quality).toBeGreaterThan(0.5);
  });
});

describe('score panel: coincidence bonus (config.bonuses.coincidence)', () => {
  /** The disabled-term fixture with the bonus term ACTIVE (core-contract shapes). */
  function withBonus(): Breakdown {
    const b = fakeBreakdown();
    b.total = 1.84; // reward − penalty + coincidence
    b.bonuses = {
      coincidence: 0.32,
      relationCoin: [
        { key: 'sales', value: 0.75 },
        { key: 'order', value: 0.32 },
      ],
      // sorted by contribution, best first; ≤ 4 per relation, > 0.01 only (core truncation)
      pairs: [
        { key: 'sales', a: 'end.y', b: 'len', aLabel: 'end y', bLabel: 'length', eq: 0.98, contribution: 0.75 },
        { key: 'sales', a: 'rise', b: 'len', aLabel: 'rise', bLabel: 'length', eq: 0.91, contribution: 0.6 },
        { key: 'order', a: 'start.x', b: 'end.x', aLabel: 'start x', bLabel: 'end x', eq: 1.0, contribution: 0.32 },
      ],
    };
    return b;
  }

  it('renders NO bonus row and NO coincident lines when the term is disabled (weight 0 shape)', () => {
    const root = document.createElement('div');
    panel(root, { breakdown: fakeBreakdown(), steps: 1, status: 'running' });
    expect(root.querySelector('.bonusrow')).toBeNull();
    expect(root.querySelector('.coinline')).toBeNull();
  });

  it('renders the bonus row (value + weight, like the data-ink row) when active', () => {
    const root = document.createElement('div');
    panel(root, { breakdown: withBonus(), steps: 1, status: 'running', coincidenceWeight: 0.3 });
    const row = root.querySelector('.bonusrow')!;
    expect(row).not.toBeNull();
    expect(row.textContent).toContain('coincidence bonus');
    expect(row.textContent).toContain('w 0.3');
    expect(row.textContent).toContain('+0.320'); // the WEIGHTED term that enters total, shown +
    // …and the data-ink penalty row is still there, untouched
    const pens = [...root.querySelectorAll('.penrow')].filter((p) => !p.classList.contains('bonusrow'));
    expect(pens.length).toBe(1);
    expect(pens[0]!.textContent).toContain('data-ink penalty');
  });

  it('lists each relation\'s top pairs as "aLabel ≡ bLabel eq" under THAT relation only', () => {
    const root = document.createElement('div');
    panel(root, { breakdown: withBonus(), steps: 1, status: 'running', coincidenceWeight: 0.3 });
    const sections = [...root.querySelectorAll('.assign')];
    const sales = sections[0]!;
    const order = sections[1]!;
    const salesLine = sales.querySelector('.coinline')!;
    expect(salesLine.textContent).toContain('coincident:');
    expect(salesLine.textContent).toContain('end y ≡ length 0.98');
    expect(salesLine.textContent).toContain('rise ≡ length 0.91');
    // ADVERSARIAL: the order relation's pair must NOT leak into the sales line (key filter)
    expect(salesLine.textContent).not.toContain('start x');
    const orderLine = order.querySelector('.coinline')!;
    expect(orderLine.textContent).toContain('start x ≡ end x 1.00');
    expect(orderLine.textContent).not.toContain('length');
  });

  it('a REAL default-config scoreExact breakdown shows the bonus row and coincident lines', () => {
    const data = wellSeparatedData();
    const b = scoreExact(goldenBarChart(data), data); // defaults: the term is active
    expect(b.bonuses.relationCoin.length).toBeGreaterThan(0);
    expect(b.bonuses.pairs.length).toBeGreaterThan(0);
    const root = document.createElement('div');
    panel(root, { breakdown: b, steps: 0, status: 'idle', coincidenceWeight: 0.3 });
    expect(root.querySelector('.bonusrow')!.textContent).toContain(
      `+${b.bonuses.coincidence.toFixed(3)}`,
    );
    expect(root.querySelectorAll('.coinline').length).toBeGreaterThan(0);
    expect(root.querySelector('.coinline')!.textContent).toContain('≡');
  });

  it('tolerates a STALE persisted breakdown with no bonuses field (Load of a pre-bonus save)', () => {
    const stale = fakeBreakdown() as Partial<Breakdown>;
    delete stale.bonuses;
    const root = document.createElement('div');
    panel(root, { breakdown: stale as Breakdown, steps: 1, status: 'loaded' });
    expect(root.querySelector('.bonusrow')).toBeNull();
    expect(root.querySelector('.coinline')).toBeNull();
    expect(root.querySelectorAll('.crow').length).toBe(4); // the rest of the panel is intact
  });
});
