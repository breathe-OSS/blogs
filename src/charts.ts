import { esc } from './templates.ts';

type Style = 'solid' | 'dashed' | 'faint';

interface Series {
  name: string;
  color: string;
  style: Style;
  values: (number | null)[];
}

interface Panel {
  title?: string;
  yMax: number;
  series: Series[];
  marks: { series: number; index: number; label: string }[];
  valueLabels?: [number, number][];
}

export interface ChartSpec {
  kind: 'line' | 'bar';
  layout?: 'single' | 'rows' | 'columns';
  title: string;
  subtitle?: string;
  unit: string;
  yLabel?: string;
  categories: boolean;
  legend?: { name: string; color: string; style: Style }[];
  x: { labels: string[]; ticks: [number, string][] };
  panels: Panel[];
  fallback?: string;
}

const BANDS: [number, number, string, string][] = [
  [0, 9, 'Good', 'good'],
  [9, 35.4, 'Moderate', 'moderate'],
  [35.4, 55.4, 'Unhealthy for sensitive groups', 'usg'],
  [55.4, 125.4, 'Unhealthy', 'unhealthy'],
  [125.4, 225.4, 'Very unhealthy', 'very-unhealthy'],
  [225.4, Infinity, 'Hazardous', 'hazardous'],
];

const SOURCE = 'Source: Breathe ground sensors (AirGradient). Times in IST.';
const TABLE_LIMIT = 100;

function colorVar(color: string): string {
  if (color === 'muted') {
    return 'var(--on-surface-variant)';
  }
  return `var(--chart-${color})`;
}

function niceStep(max: number): number {
  const raw = max / 5;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const factor of [1, 2, 2.5, 5, 10]) {
    if (factor * magnitude >= raw) {
      return factor * magnitude;
    }
  }
  return 10 * magnitude;
}

function xPosition(spec: ChartSpec, index: number): number {
  const count = spec.x.labels.length;
  if (spec.categories || spec.kind === 'bar') {
    return ((index + 0.5) / count) * 100;
  }
  if (count <= 1) {
    return 50;
  }
  return (index / (count - 1)) * 100;
}

function round(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function linePath(spec: ChartSpec, series: Series, yMax: number): string {
  const parts: string[] = [];
  let drawing = false;
  series.values.forEach((value, index) => {
    if (value === null) {
      drawing = false;
      return;
    }
    const x = round(xPosition(spec, index) * 10);
    const y = round(1000 - (Math.min(value, yMax) / yMax) * 1000);
    parts.push(`${drawing ? 'L' : 'M'}${x} ${y}`);
    drawing = true;
  });
  return parts.join('');
}

function bars(spec: ChartSpec, panel: Panel): string {
  const count = spec.x.labels.length;
  const groupWidth = 1000 / count;
  const inner = groupWidth * 0.78;
  const barWidth = inner / panel.series.length;
  const gap = barWidth * 0.1;
  const rects: string[] = [];
  panel.series.forEach((series, seriesIndex) => {
    series.values.forEach((value, index) => {
      if (value === null) {
        return;
      }
      const x = index * groupWidth + (groupWidth - inner) / 2 + seriesIndex * barWidth + gap / 2;
      const height = (Math.min(value, panel.yMax) / panel.yMax) * 1000;
      rects.push(
        `<rect class="chart-bar" data-i="${index}" x="${round(x)}" y="${round(1000 - height)}" width="${round(barWidth - gap)}" height="${round(height)}" style="fill: ${colorVar(series.color)}" />`
      );
    });
  });
  return rects.join('');
}

function bandRects(yMax: number): string {
  return BANDS.filter(([low]) => low < yMax)
    .map(([low, high, , key]) => {
      const top = Math.min(high, yMax);
      const y = 1000 - (top / yMax) * 1000;
      const height = ((top - low) / yMax) * 1000;
      return `<rect class="chart-band band-${key}" x="0" y="${round(y)}" width="1000" height="${round(height)}" />`;
    })
    .join('');
}

function gridLines(yMax: number): { lines: string; labels: string } {
  const step = niceStep(yMax);
  const lines: string[] = [];
  const labels: string[] = [];
  for (let value = 0; value <= yMax + 0.0001; value += step) {
    const y = round(1000 - (value / yMax) * 1000);
    lines.push(`<line class="chart-grid" x1="0" x2="1000" y1="${y}" y2="${y}" />`);
    labels.push(`<span style="bottom: ${round((value / yMax) * 100)}%">${round(value)}</span>`);
  }
  return { lines: lines.join(''), labels: labels.join('') };
}

function marks(spec: ChartSpec, panel: Panel): string {
  const items: string[] = [];
  for (const mark of panel.marks) {
    const series = panel.series[mark.series];
    const value = series.values[mark.index];
    if (value === null || value === undefined) {
      continue;
    }
    const left = round(xPosition(spec, mark.index));
    const top = round(100 - (Math.min(value, panel.yMax) / panel.yMax) * 100);
    const side = Number(left) > 70 ? 'left' : 'above';
    items.push(
      `<span class="chart-mark" style="left: ${left}%; top: ${top}%; --c: ${colorVar(series.color)}"></span>`,
      `<span class="chart-mark-label chart-mark-${side}" style="left: ${left}%; top: ${top}%">${esc(mark.label)}</span>`
    );
  }
  for (const [seriesIndex, index] of panel.valueLabels ?? []) {
    const series = panel.series[seriesIndex];
    const value = series.values[index];
    if (value === null || value === undefined) {
      continue;
    }
    const count = spec.x.labels.length;
    const groupWidth = 100 / count;
    const inner = groupWidth * 0.78;
    const barWidth = inner / panel.series.length;
    const left = index * groupWidth + (groupWidth - inner) / 2 + (seriesIndex + 0.5) * barWidth;
    const bottom = (Math.min(value, panel.yMax) / panel.yMax) * 100;
    items.push(
      `<span class="chart-value" style="left: ${round(left)}%; bottom: ${round(bottom)}%">${Math.round(value)}</span>`
    );
  }
  return items.join('');
}

function legend(spec: ChartSpec): string {
  if (!spec.legend || spec.legend.length === 0) {
    return '';
  }
  const items = spec.legend
    .map((item) => {
      return `<span class="chart-legend-item"><span class="chart-swatch swatch-${item.style}" style="--c: ${colorVar(item.color)}"></span>${esc(item.name)}</span>`;
    })
    .join('');
  return `<div class="chart-legend">${items}</div>`;
}

function bandLegend(spec: ChartSpec): string {
  const yMax = Math.max(...spec.panels.map((panel) => panel.yMax));
  const items = BANDS.filter(([low]) => low < yMax)
    .map(([, , label, key]) => {
      return `<span class="chart-band-item"><span class="chart-band-swatch band-${key}"></span>${label}</span>`;
    })
    .join('');
  return `<div class="chart-bands" aria-label="US EPA 24-hour PM2.5 categories">${items}</div>`;
}

function table(spec: ChartSpec): string {
  if (spec.x.labels.length > TABLE_LIMIT) {
    return '';
  }
  const columns: { heading: string; values: (number | null)[] }[] = [];
  for (const panel of spec.panels) {
    for (const series of panel.series) {
      const heading =
        panel.title && panel.title !== series.name ? `${panel.title}, ${series.name}` : series.name;
      columns.push({ heading, values: series.values });
    }
  }
  const head = columns.map((column) => `<th>${esc(column.heading)}</th>`).join('');
  const rows = spec.x.labels
    .map((label, index) => {
      const cells = columns
        .map((column) => {
          const value = column.values[index];
          return `<td>${value === null || value === undefined ? '' : value.toFixed(1)}</td>`;
        })
        .join('');
      return `<tr><th scope="row">${esc(label)}</th>${cells}</tr>`;
    })
    .join('');
  return `<details class="chart-table"><summary>Show the numbers</summary><div class="chart-table-scroll"><table><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table></div></details>`;
}

function panelHtml(spec: ChartSpec, panel: Panel, index: number): string {
  const grid = gridLines(panel.yMax);
  const body =
    spec.kind === 'bar'
      ? bars(spec, panel)
      : panel.series
          .map((series) => {
            return `<path class="chart-line line-${series.style}" d="${linePath(spec, series, panel.yMax)}" style="stroke: ${colorVar(series.color)}" />`;
          })
          .join('');
  const thin = spec.x.ticks.length > 8;
  const ticks = spec.x.ticks
    .map(([tick, label], position) => {
      const minor = thin && position % 2 === 1 ? ' class="tick-minor"' : '';
      return `<span${minor} style="left: ${round(xPosition(spec, tick))}%">${esc(label).replace(/\n/g, '<br>')}</span>`;
    })
    .join('');
  const title = panel.title ? `<div class="chart-panel-title">${esc(panel.title)}</div>` : '';
  const aria = `${spec.title}${panel.title ? `, ${panel.title}` : ''}. Use the left and right arrow keys to read each value.`;

  return `<div class="chart-panel" data-panel="${index}">
      ${title}
      <div class="chart-body">
        <div class="chart-y" aria-hidden="true">${grid.labels}</div>
        <div class="chart-plot" tabindex="0" role="group" aria-label="${esc(aria)}">
          <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true" focusable="false">${bandRects(panel.yMax)}${grid.lines}${body}</svg>
          ${marks(spec, panel)}
        </div>
        <div class="chart-x" aria-hidden="true">${ticks}</div>
      </div>
    </div>`;
}

export function renderChart(spec: ChartSpec, dataUrl: string): string {
  const layout = spec.layout ?? 'single';
  const payload = {
    kind: spec.kind,
    unit: spec.unit,
    categories: spec.categories,
    labels: spec.x.labels,
    panels: spec.panels.map((panel) => ({
      title: panel.title ?? null,
      yMax: panel.yMax,
      series: panel.series.map((series) => ({
        name: series.name,
        color: series.color,
        values: series.values,
      })),
    })),
  };
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  const panels = spec.panels.map((panel, index) => panelHtml(spec, panel, index)).join('');
  const yLabel = spec.yLabel ? `<div class="chart-unit">${esc(spec.yLabel)}</div>` : '';

  return `<figure class="chart chart-${spec.kind} chart-layout-${layout}">
    <figcaption class="chart-head">
      <div class="chart-title">${esc(spec.title)}</div>
      ${spec.subtitle ? `<div class="chart-subtitle">${esc(spec.subtitle)}</div>` : ''}
      ${legend(spec)}
    </figcaption>
    ${yLabel}
    <div class="chart-panels">${panels}</div>
    ${bandLegend(spec)}
    <div class="chart-foot">
      <span>${SOURCE}</span>
      <a href="${esc(dataUrl)}" download>Download the data</a>
    </div>
    ${table(spec)}
    <script type="application/json" class="chart-data">${json}</script>
  </figure>`;
}
