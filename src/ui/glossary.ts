// src/ui/glossary.ts
//
// The GLOSSARY panel: a read-only, newcomer-friendly key to every term the UI puts on screen — the
// 16 readings, the score terms, the reinforcement controls, and the run vocabulary. It sits between
// the Reinforcement panel and the Score panel, and reuses the Readings strip's fold mechanism
// EXACTLY (a <details class="readings"> with the ▸/▾ summary; see carrierStrip.ts / index.html CSS)
// so it looks and folds like its siblings. Collapsed by default (no `open` attribute).
//
// Unlike the Readings/Reinforcement panels there is NO pending/live state and no callbacks: the
// glossary is static reference text, so it mounts once and never updates. The Readings strip does
// not persist its fold state in prefs (its `open` is hard-coded in HTML), so — per spec — the
// glossary invents no persistence either; the browser tracks the <details> open/closed state.
//
// CONTENT lives in the exported GLOSSARY structure (a list of titled groups of {term, def} rows) so
// it is testable in isolation. The READINGS group's terms are the EXACT plain-English labels the
// measurement registry emits (registry.labelOf / carriers(cfg).label); an adversarial test iterates
// carriers(config) and asserts every live carrier label appears here, so a new/renamed reading that
// slips past the glossary fails CI rather than silently going undocumented.

/** One glossary entry: a term exactly as it appears in the UI, and a one- (max two-) line gloss. */
export interface GlossaryEntry {
  readonly term: string;
  readonly def: string;
}

/** A titled group of entries (rendered as a labelled subsection, mirroring the readings groups). */
export interface GlossaryGroup {
  readonly title: string;
  readonly entries: readonly GlossaryEntry[];
}

/**
 * The glossary content. The four groups match the four families of on-screen vocabulary. The
 * READINGS terms are verbatim carrier labels (registry.ts) — do not paraphrase them or the census
 * test breaks; the imagery (flagpole anchor, ruler laid across the page) is the project's voice.
 */
export const GLOSSARY: readonly GlossaryGroup[] = [
  {
    title: 'Readings',
    entries: [
      // point positions — page and frame read the same vector here, so they show unprefixed
      { term: 'start x', def: "How far right the segment's start point sits: its horizontal position, read like a mark on a ruler laid across the page." },
      { term: 'start y', def: "How far up the segment's start point sits: its vertical position (page and frame agree here)." },
      { term: 'mid x', def: "Horizontal position of the segment's midpoint along that same page-ruler." },
      { term: 'mid y', def: "Vertical position of the segment's midpoint." },
      { term: 'end x', def: "Horizontal position of the segment's far end." },
      { term: 'end y', def: "Vertical position of the segment's far end." },
      // frame-anchored distances — straight-line from the frame's anchor (the origin flagpole)
      { term: 'fr·start dist', def: "Straight-line distance from the frame's anchor point out to the start: how far the start is planted from the origin flagpole." },
      { term: 'fr·mid dist', def: "Straight-line distance from the frame's anchor point to the segment's midpoint." },
      { term: 'fr·end dist', def: "Straight-line distance from the frame's anchor point to the segment's far end." },
      // frame-anchored bearings — which way you'd point from the flagpole to face the part
      { term: 'fr·start angle', def: "The bearing from the frame's anchor to the start point: which way you'd point to face it." },
      { term: 'fr·mid angle', def: "The bearing from the frame's anchor to the segment's midpoint." },
      { term: 'fr·end angle', def: "The bearing from the frame's anchor to the segment's far end." },
      // the segment's own displacement readings
      { term: 'angle', def: "The segment's own tilt: the compass bearing the drawn line points along." },
      { term: 'run', def: "How far the segment travels sideways from start to end — its horizontal extent." },
      { term: 'rise', def: "How far the segment travels up or down from start to end — its vertical extent." },
      { term: 'length', def: "The segment's total length: how long the drawn line is, end to end." },
    ],
  },
  {
    title: 'Score terms',
    entries: [
      { term: 'quality', def: "The headline 0–1 grade for one figure: how faithfully it diagrams the data, chance-corrected so a random scribble scores near 0." },
      { term: 'total', def: "The raw objective the evolver climbs, before it is rescaled into the plain-English quality grade." },
      { term: 'tracking', def: "How many distinct readings genuinely carry the data — the count of relations the figure gets right at once." },
      { term: 'salience', def: "A reader-resolution gate: differences too small for a viewer's eye to resolve are dimmed, so the score can't cash in on invisible precision (why some rows dim)." },
      { term: 'τ (order)', def: "Rank agreement, with ± direction: do the segments come out in the same order as the data values, and the right way round?" },
      { term: 'r² (linear fit)', def: "How close a reading is to a straight-line match with the data — 1 means it rises in perfect lockstep, offset allowed." },
      { term: '∝ (proportionality)', def: "Strict proportionality: the reading is the data times a single scale with no offset — true bar-chart behaviour." },
      { term: 'commensurable', def: "Two readings are commensurable when they are in the same units, so their numbers can be compared or set equal." },
      { term: 'distinct carriers vs census', def: "The census is all 26 raw measurements; distinct carriers are the ~16 that read genuinely different things once exact duplicates are merged." },
      { term: 'data-ink penalty', def: "A cost for ink that carries no data: extra or wasted marks lower the score, rewarding lean diagrams." },
      { term: 'LSE / smooth-max', def: "A soft maximum: the best reading dominates the score, but extra matches that also agree still nudge it up." },
    ],
  },
  {
    title: 'Reinforcement',
    entries: [
      { term: 'matches', def: "Several independent readings agreeing on the same relation — counted so redundant confirmation strengthens it, not just the single best reading." },
      { term: 'coincidence weak', def: "Two readings the figure arranges to return the same number in the same units earn a bonus: same-magnitude equality." },
      { term: 'coincidence strong', def: "A stricter bonus: the two readings must lie on the same drawn ink path (the ruler rests on the ink — the 'ink' factor), and the segment must have real extent." },
      { term: 'enacted equations', def: "Equalities the figure physically enacts — like an axis identity — grounding the score in relations the drawing itself makes true." },
    ],
  },
  {
    title: 'Run terms',
    entries: [
      { term: 'trajectory', def: "One evolving figure's run: a single line of descent from random segments toward a diagram." },
      { term: 'plateaued vs capped', def: "A trajectory stops either because its score stopped improving (plateaued) or because it hit the step limit (capped)." },
      { term: 'restart fresh/mutant', def: "When a slot restarts it begins either from brand-new random segments (fresh) or from a mutation of a good figure (mutant)." },
      { term: 'reference bars cell', def: "A permanent gallery cell showing the ideal golden bar chart of the dataset, scored the same way as a benchmark to compare against." },
      { term: 'max steps', def: "The per-trajectory step limit before a run is capped — raise it to let runs go longer." },
      { term: 'plateau eps', def: "How flat the score must go before a run counts as plateaued — smaller is stricter, so runs keep going longer." },
    ],
  },
];

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Mount the read-only glossary once. Static content ⇒ no update function and no listeners: the
 * <details> open/closed state is handled natively by the browser, exactly like the Readings strip
 * (which also mounts its fold once and never rebuilds it). Collapsed by default: no `open`.
 */
export function mountGlossary(root: HTMLElement): void {
  const groupsHtml = GLOSSARY.map((g) => {
    const rows = g.entries
      .map(
        (e) =>
          `<div class="grow"><dt class="gterm">${esc(e.term)}</dt><dd class="gdef muted">${esc(e.def)}</dd></div>`,
      )
      .join('');
    return `<div class="gsection">
      <div class="rgname muted">${esc(g.title)}</div>
      <dl class="glist">${rows}</dl>
    </div>`;
  }).join('');

  root.innerHTML = `<details class="readings glossary">
    <summary>
      <h3>Glossary</h3>
    </summary>
    <div class="rhint muted">a plain-English key to every reading, score term, and control on screen</div>
    ${groupsHtml}
  </details>`;
}
