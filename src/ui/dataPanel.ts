// src/ui/dataPanel.ts
//
// Renders the DATASET being targeted — labels A..L along the ordinal axis with their ratio (dollar)
// values as reference bars. This is the ground truth the figure is trying to become; kept legible and
// separate from the evolving figure (ARCHITECTURE.md GUI spec).

import type { DataSet } from '../core/data';

const money = (v: number): string => `$${Math.round(v).toLocaleString()}`;

export function renderDataPanel(root: HTMLElement, data: DataSet): void {
  const max = Math.max(...data.values, 1);
  const rows = data.labels
    .map((label, i) => {
      const v = data.values[i]!;
      const pct = (100 * v) / max;
      return `<div class="drow">
        <span class="dlabel">${label}</span>
        <span class="dbartrack"><span class="dbar" style="width:${pct.toFixed(1)}%"></span></span>
        <span class="dval">${money(v)}</span>
      </div>`;
    })
    .join('');
  root.innerHTML = `<h3>Target dataset <span class="muted">seed ${data.seed} · ratio scale</span></h3>
    <div class="dtable">${rows}</div>`;
}
