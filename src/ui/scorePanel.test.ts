// @vitest-environment jsdom
//
// src/ui/scorePanel.test.ts — adversarial checks on the v2 score panel:
//  • plain-English labels only — NO ∥/⊥/∠ glyphs and no 'disp'/'mag' abbreviations anywhere,
//  • salience chip + dimming below the gate, ↑/↓ from signedTau, rung CSS classes used correctly,
//  • 'N tracking' counts DISTINCT carriers with q ≥ 0.9, data-ink penalty row, honest headline,
//  • live converged/capped status line.
// The breakdown is hand-built so every displayed branch is exercised deterministically; a second
// test feeds a REAL scoreExact breakdown to catch drift between the panel and core types.

import { describe, it, expect } from 'vitest';
import { renderScorePanel } from './scorePanel';
import { ScaleType } from '../core/scale';
import { scoreExact, type Breakdown, type CarrierScore } from '../core/score';
import { goldenBarChart, wellSeparatedData } from '../core/fixtures';

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
    distinctCarriers: 16,
    censusSize: 26,
  };
}

describe('score panel v2', () => {
  it('uses plain-English labels — no v1 glyphs or abbreviations anywhere in the DOM', () => {
    const root = document.createElement('div');
    renderScorePanel(root, { breakdown: fakeBreakdown(), steps: 42, status: 'running' });
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
    renderScorePanel(root, { breakdown: fakeBreakdown(), steps: 1, status: 'running' });
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
    renderScorePanel(root, { breakdown: fakeBreakdown(), steps: 1, status: 'running' });
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
    renderScorePanel(root, {
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
    renderScorePanel(root, { breakdown: b, steps: 0, status: 'idle' });
    expect(root.querySelectorAll('.crow').length).toBeGreaterThan(0);
    for (const banned of ['∥', '⊥', '∠', 'projPar', 'projPerp']) {
      expect(root.innerHTML).not.toContain(banned);
    }
    // the golden bar chart's headline is honest and high
    expect(b.quality).toBeGreaterThan(0.5);
  });
});
