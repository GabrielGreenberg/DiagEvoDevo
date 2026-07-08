// @vitest-environment jsdom
//
// src/ui/glossary.test.ts — adversarial coverage for the read-only Glossary panel:
//   • CENSUS COMPLETENESS: every live distinct carrier's plain-English label (carriers(config))
//     appears verbatim as a glossary term — a new or renamed reading that slips past the glossary
//     fails here rather than shipping undocumented.
//   • FOLD: it uses the Readings strip's <details class="readings"> fold, collapsed by default, and
//     opens/closes.
//   • NON-INTERFERENCE: mounting the glossary next to the other panels leaves Readings,
//     Reinforcement, and Score rendering intact.
//   • DATA HYGIENE: no empty/duplicate terms, every term has a definition.

import { describe, it, expect, vi } from 'vitest';
import { mountGlossary, GLOSSARY } from './glossary';
import { carriers } from '../core/measurements/registry';
import { config } from '../config';
import { mountCarrierStrip } from './carrierStrip';
import { mountReinforcement } from './reinforcement';
import { renderScorePanel } from './scorePanel';
import { goldenBarChart, wellSeparatedData } from '../core/fixtures';
import { scoreExact } from '../core/score';

/** Flat list of every glossary term across all groups. */
function allTerms(): string[] {
  return GLOSSARY.flatMap((g) => g.entries.map((e) => e.term));
}

describe('glossary content', () => {
  it('documents every live distinct carrier label as a term (census completeness)', () => {
    const terms = new Set(allTerms());
    const missing = carriers(config)
      .map((c) => c.label)
      .filter((label) => !terms.has(label));
    expect(missing).toEqual([]);
  });

  it('has a Readings group whose terms are EXACTLY the live carrier labels (no drift either way)', () => {
    const readings = GLOSSARY.find((g) => g.title === 'Readings');
    expect(readings).toBeDefined();
    const readingTerms = new Set(readings!.entries.map((e) => e.term));
    const carrierLabels = new Set(carriers(config).map((c) => c.label));
    expect([...readingTerms].sort()).toEqual([...carrierLabels].sort());
  });

  it('has the score / reinforcement / run groups the spec names', () => {
    const titles = GLOSSARY.map((g) => g.title);
    expect(titles).toContain('Score terms');
    expect(titles).toContain('Reinforcement');
    expect(titles).toContain('Run terms');
  });

  it('names the key score, reinforcement, and run terms', () => {
    const terms = new Set(allTerms());
    for (const t of [
      'quality',
      'total',
      'tracking',
      'salience',
      'commensurable',
      'data-ink penalty',
      'LSE / smooth-max',
      'matches',
      'coincidence weak',
      'coincidence strong',
      'enacted equations',
      'trajectory',
      'reference bars cell',
      'max steps',
      'plateau eps',
    ]) {
      expect(terms).toContain(t);
    }
  });

  it('has no empty or duplicate terms and every term is defined', () => {
    const terms = allTerms();
    expect(new Set(terms).size).toBe(terms.length); // no duplicates
    for (const g of GLOSSARY) {
      for (const e of g.entries) {
        expect(e.term.trim().length).toBeGreaterThan(0);
        expect(e.def.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe('glossary panel (DOM)', () => {
  it('renders every term and definition into the DOM', () => {
    const root = document.createElement('div');
    mountGlossary(root);
    const terms = [...root.querySelectorAll('.gterm')].map((el) => el.textContent);
    for (const t of allTerms()) expect(terms).toContain(t);
    expect(root.querySelectorAll('.gdef').length).toBe(allTerms().length);
  });

  it('uses the Readings strip fold mechanism and is collapsed by default', () => {
    const root = document.createElement('div');
    mountGlossary(root);
    const details = root.querySelector('details.readings.glossary') as HTMLDetailsElement | null;
    expect(details).not.toBeNull();
    expect(details!.open).toBe(false); // collapsed by default
    // fold open, then closed
    details!.open = true;
    expect(details!.open).toBe(true);
    details!.open = false;
    expect(details!.open).toBe(false);
    // same summary heading pattern as the siblings
    expect(details!.querySelector('summary h3')?.textContent).toBe('Glossary');
  });

  it('does not persist its fold state (no localStorage writes on mount — mirrors Readings)', () => {
    const spy = vi.fn();
    const root = document.createElement('div');
    // if the module tried to persist fold state it would call setItem; it must not.
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: spy,
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as unknown as Storage);
    mountGlossary(root);
    expect(spy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('glossary does not interfere with sibling panels', () => {
  it('leaves Readings, Reinforcement, and Score panels rendering when all are mounted', () => {
    const readingsRoot = document.createElement('div');
    const reinforceRoot = document.createElement('div');
    const glossaryRoot = document.createElement('div');
    const scoreRoot = document.createElement('div');

    mountCarrierStrip(readingsRoot, { onToggleCarrier: () => {} });
    mountReinforcement(reinforceRoot, { onToggleMatchBonus: () => {}, onSelectCoincidence: () => {} });
    mountGlossary(glossaryRoot);
    const data = wellSeparatedData();
    const breakdown = scoreExact(goldenBarChart(data), data);
    renderScorePanel(scoreRoot, {
      breakdown,
      steps: 0,
      status: 'idle',
      coincidenceWeight: 0,
      coincidenceMode: 'weak',
    });

    // each sibling still produced its own DOM
    expect(readingsRoot.querySelector('details.readings')).not.toBeNull();
    expect(readingsRoot.querySelectorAll('.chip').length).toBeGreaterThan(0);
    expect(reinforceRoot.querySelector('details.readings.reinforce')).not.toBeNull();
    expect(reinforceRoot.querySelector('.chip[data-rk="matchBonus"]')).not.toBeNull();
    expect(scoreRoot.textContent?.length ?? 0).toBeGreaterThan(0);

    // and the glossary is its own independent <details> — no shared/duplicated ids or roots
    expect(glossaryRoot.querySelector('details.readings.glossary')).not.toBeNull();
    // the glossary must NOT have injected chips (it is chip-free reference text)
    expect(glossaryRoot.querySelectorAll('.chip').length).toBe(0);
  });
});
