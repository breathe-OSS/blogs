type Style = 'solid' | 'dashed' | 'faint';

interface PlotSeries {
  name: string;
  color: string;
  style: Style;
  values: (number | null)[];
}

interface PlotOptions {
  height?: number;
  bars?: boolean;
  ticks: [number, string][];
  label: (index: number) => string;
  unit: string;
}

interface Plot {
  draw: (series: PlotSeries[], yMax: number, bands?: Band[]) => void;
}

interface Band {
  limit: number;
  label: string;
  key: string;
}

const EPA_BANDS: Band[] = [
  { limit: 9, label: 'Good', key: 'good' },
  { limit: 35.4, label: 'Moderate', key: 'moderate' },
  { limit: 55.4, label: 'Unhealthy for sensitive groups', key: 'usg' },
  { limit: 125.4, label: 'Unhealthy', key: 'unhealthy' },
  { limit: 225.4, label: 'Very unhealthy', key: 'very-unhealthy' },
  { limit: Infinity, label: 'Hazardous', key: 'hazardous' },
];

const EPA_PM10_BANDS: Band[] = [
  { limit: 54, label: 'Good', key: 'good' },
  { limit: 154, label: 'Moderate', key: 'moderate' },
  { limit: 254, label: 'Unhealthy for sensitive groups', key: 'usg' },
  { limit: 354, label: 'Unhealthy', key: 'unhealthy' },
  { limit: 424, label: 'Very unhealthy', key: 'very-unhealthy' },
  { limit: Infinity, label: 'Hazardous', key: 'hazardous' },
];

const EPA_AQI: [number, number, number, number][] = [
  [0, 9, 0, 50],
  [9, 35.4, 50, 100],
  [35.4, 55.4, 100, 150],
  [55.4, 125.4, 150, 200],
  [125.4, 225.4, 200, 300],
  [225.4, 325.4, 300, 500],
];

const NAQI: [number, number, number, number, string, string][] = [
  [0, 30, 0, 50, 'Good', 'good'],
  [30, 60, 50, 100, 'Satisfactory', 'satisfactory'],
  [60, 90, 100, 200, 'Moderate', 'moderate'],
  [90, 120, 200, 300, 'Poor', 'poor'],
  [120, 250, 300, 400, 'Very poor', 'very-poor'],
  [250, 380, 400, 500, 'Severe', 'severe'],
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function svg(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

function colorVar(color: string): string {
  if (color === 'muted') {
    return 'var(--on-surface-variant)';
  }
  return `var(--chart-${color})`;
}

function fmt(value: number): string {
  if (value >= 100) {
    return String(Math.round(value));
  }
  return value.toFixed(1);
}

function epaBand(value: number, bands: Band[] = EPA_BANDS): Band {
  for (const band of bands) {
    if (value <= band.limit) {
      return band;
    }
  }
  return bands[bands.length - 1];
}

function interpolate(
  value: number,
  low: number,
  high: number,
  aqiLow: number,
  aqiHigh: number
): number {
  return aqiLow + ((value - low) / (high - low)) * (aqiHigh - aqiLow);
}

function epaAqi(value: number): number {
  const c = Math.floor(value * 10) / 10;
  for (const [low, high, aqiLow, aqiHigh] of EPA_AQI) {
    if (c <= high) {
      return Math.round(interpolate(c, low, high, aqiLow, aqiHigh));
    }
  }
  return 500;
}

function stretchedAqi(value: number): number {
  if (value <= 225.4) {
    return epaAqi(value);
  }
  return Math.round(interpolate(value, 225.4, 325.4, 300, 500));
}

function naqi(value: number): { aqi: number; label: string; key: string } {
  for (const [low, high, aqiLow, aqiHigh, label, key] of NAQI) {
    if (value <= high) {
      return { aqi: Math.round(interpolate(value, low, high, aqiLow, aqiHigh)), label, key };
    }
  }
  return { aqi: 500, label: 'Severe', key: 'severe' };
}

function clock(seconds: number): string {
  const date = new Date(seconds * 1000);
  let hours = date.getUTCHours();
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const suffix = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  if (hours === 0) {
    hours = 12;
  }
  return `${hours}:${minutes} ${suffix}`;
}

function day(seconds: number): string {
  const date = new Date(seconds * 1000);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
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

function head(figure: HTMLElement, title: string, subtitle: string): void {
  const caption = el('figcaption', 'chart-head');
  caption.append(el('div', 'chart-title', title), el('div', 'chart-subtitle', subtitle));
  figure.append(caption);
}

function foot(figure: HTMLElement, text: string): void {
  const footer = el('div', 'chart-foot');
  footer.append(el('span', '', text));
  figure.append(footer);
}

function chips<T extends string>(
  options: [T, string][],
  selected: T,
  label: string,
  onChange: (value: T) => void
): HTMLElement {
  const group = el('div', 'widget-chips');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  const buttons: HTMLButtonElement[] = [];
  for (const [value, text] of options) {
    const button = el('button', 'widget-chip', text) as HTMLButtonElement;
    button.type = 'button';
    button.setAttribute('aria-pressed', String(value === selected));
    button.addEventListener('click', () => {
      for (const other of buttons) {
        other.setAttribute('aria-pressed', String(other === button));
      }
      onChange(value);
    });
    buttons.push(button);
    group.append(button);
  }
  return group;
}

function presets(options: [string, () => void][], label: string): HTMLElement {
  const group = el('div', 'widget-chips');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  for (const [text, action] of options) {
    const button = el('button', 'widget-chip', text) as HTMLButtonElement;
    button.type = 'button';
    button.addEventListener('click', action);
    group.append(button);
  }
  return group;
}

function slider(
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  unit: string,
  onInput: (value: number) => void
): { root: HTMLElement; set: (value: number) => void } {
  const root = el('label', 'widget-slider');
  const top = el('span', 'widget-slider-top');
  const name = el('span', 'widget-slider-label', label);
  const output = el('span', 'widget-slider-value');
  top.append(name, output);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  const show = (current: number): void => {
    input.style.setProperty('--fill', `${((current - min) / (max - min)) * 100}%`);
    const text = Number.isInteger(step) ? String(Math.round(current)) : fmt(current);
    output.textContent = unit === '%' ? `${text}%` : `${text} ${unit}`;
  };
  let frame = 0;
  input.addEventListener('input', () => {
    const current = Number(input.value);
    show(current);
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      onInput(current);
    });
  });
  show(value);
  root.append(top, input);
  return {
    root,
    set: (next: number) => {
      input.value = String(next);
      show(next);
    },
  };
}

function stats(): { root: HTMLElement; set: (items: [string, string, string?][]) => void } {
  const root = el('div', 'widget-stats');
  root.setAttribute('aria-live', 'polite');
  return {
    root,
    set: (items) => {
      if (root.children.length === items.length) {
        items.forEach(([label, value, note], index) => {
          const item = root.children[index];
          const parts = item.children;
          if (parts[0].textContent !== label) {
            parts[0].textContent = label;
          }
          if (parts[1].textContent !== value) {
            parts[1].textContent = value;
          }
          if (parts[2].textContent !== (note ?? '')) {
            parts[2].textContent = note ?? '';
          }
        });
        return;
      }
      root.replaceChildren(
        ...items.map(([label, value, note]) => {
          const item = el('div', 'widget-stat');
          item.append(
            el('span', 'widget-stat-label', label),
            el('span', 'widget-stat-value', value),
            el('span', 'widget-stat-note', note ?? '')
          );
          return item;
        })
      );
    },
  };
}

function createPlot(parent: HTMLElement, options: PlotOptions): Plot {
  const body = el('div', 'chart-body widget-plot');
  if (options.height) {
    body.style.gridTemplateRows = `${options.height}px auto`;
  }
  const yAxis = el('div', 'chart-y');
  yAxis.setAttribute('aria-hidden', 'true');
  const area = el('div', 'chart-plot');
  const xAxis = el('div', 'chart-x');
  xAxis.setAttribute('aria-hidden', 'true');
  const canvas = svg('svg', {
    viewBox: '0 0 1000 1000',
    preserveAspectRatio: 'none',
    'aria-hidden': 'true',
  });
  const crosshair = el('div', 'chart-crosshair');
  const tooltip = el('div', 'chart-tooltip');
  crosshair.hidden = true;
  tooltip.hidden = true;
  area.append(canvas, crosshair, tooltip);
  body.append(yAxis, area, xAxis);
  parent.append(body);

  let current: PlotSeries[] = [];
  let count = 1;
  let top = 1;
  let drawnTop = -1;
  let bands = EPA_BANDS;
  let drawnBands: Band[] | null = null;
  const backdrop = svg('g', {});
  const data = svg('g', {});
  const lines: SVGElement[] = [];
  canvas.append(backdrop, data);

  const position = (index: number): number => {
    if (options.bars) {
      return ((index + 0.5) / count) * 100;
    }
    return count <= 1 ? 50 : (index / (count - 1)) * 100;
  };

  const thin = options.ticks.length > 6;
  for (const [position, [index, label]] of options.ticks.entries()) {
    const tick = el('span', thin && position % 2 === 1 ? 'tick-minor' : '');
    tick.innerHTML = label.replace(/\n/g, '<br>');
    tick.dataset.index = String(index);
    xAxis.append(tick);
  }

  const placeTicks = (): void => {
    for (const tick of Array.from(xAxis.children) as HTMLElement[]) {
      tick.style.left = `${position(Number(tick.dataset.index))}%`;
    }
  };

  const showAt = (clientX: number): void => {
    if (current.length === 0) {
      return;
    }
    const rect = area.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const index = options.bars
      ? Math.min(count - 1, Math.floor(fraction * count))
      : Math.round(fraction * (count - 1));
    const left = position(index);
    crosshair.hidden = false;
    crosshair.style.left = `${left}%`;
    const rows: HTMLElement[] = [el('div', 'chart-tooltip-title', options.label(index))];
    for (const series of current) {
      const value = series.values[index];
      const row = el('div', 'chart-tooltip-row');
      const swatch = el('span', 'chart-swatch');
      swatch.style.setProperty('--c', colorVar(series.color));
      const text =
        value === null || value === undefined ? 'no data' : `${fmt(value)} ${options.unit}`;
      row.append(swatch, el('span', '', series.name), el('span', 'chart-tooltip-value', text));
      rows.push(row);
    }
    const first = current.find((series) => series.style !== 'faint') ?? current[0];
    const value = first.values[index];
    if (value !== null && value !== undefined) {
      rows.push(el('div', 'chart-tooltip-category', `US EPA: ${epaBand(value, bands).label}`));
    }
    tooltip.replaceChildren(...rows);
    tooltip.hidden = false;
    const width = area.clientWidth;
    const x = (left / 100) * width;
    let offset = x + 12;
    if (offset + tooltip.offsetWidth > width) {
      offset = x - 12 - tooltip.offsetWidth;
    }
    tooltip.style.left = `${Math.max(0, Math.min(offset, width - tooltip.offsetWidth))}px`;
  };

  const hide = (): void => {
    crosshair.hidden = true;
    tooltip.hidden = true;
  };

  area.addEventListener('pointermove', (event: PointerEvent) => {
    showAt(event.clientX);
  });
  area.addEventListener('pointerdown', (event: PointerEvent) => {
    showAt(event.clientX);
  });
  area.addEventListener('pointerleave', (event: PointerEvent) => {
    if (event.pointerType === 'mouse') {
      hide();
    }
  });
  document.addEventListener('pointerdown', (event: PointerEvent) => {
    if (!area.contains(event.target as Node)) {
      hide();
    }
  });

  return {
    draw: (series, yMax, bandSet) => {
      current = series;
      count = Math.max(1, ...series.map((item) => item.values.length));
      top = yMax;
      placeTicks();
      bands = bandSet ?? EPA_BANDS;
      if (top !== drawnTop || bands !== drawnBands) {
        drawnTop = top;
        drawnBands = bands;
        drawBackdrop();
      }
      if (options.bars) {
        drawBars(series);
        return;
      }
      series.forEach((item, index) => {
        if (!lines[index]) {
          lines[index] = svg('path', {});
          data.append(lines[index]);
        }
        const line = lines[index];
        line.setAttribute('class', `chart-line line-${item.style}`);
        line.setAttribute('style', `stroke: ${colorVar(item.color)}`);
        line.setAttribute('d', pathFor(item.values));
      });
      for (let index = series.length; index < lines.length; index++) {
        lines[index].setAttribute('d', '');
      }
    },
  };

  function pathFor(values: (number | null)[]): string {
    let d = '';
    let drawing = false;
    values.forEach((value, index) => {
      if (value === null || value === undefined) {
        drawing = false;
        return;
      }
      const x = Math.round(position(index) * 100) / 10;
      const y = Math.round((1000 - (Math.min(value, top) / top) * 1000) * 10) / 10;
      d += `${drawing ? 'L' : 'M'}${x} ${y}`;
      drawing = true;
    });
    return d;
  }

  function drawBars(series: PlotSeries[]): void {
    const nodes: SVGElement[] = [];
    const width = (1000 / count) * 0.8;
    for (const item of series) {
      item.values.forEach((value, index) => {
        if (value === null || value === undefined) {
          return;
        }
        const height = (Math.min(value, top) / top) * 1000;
        nodes.push(
          svg('rect', {
            class: `widget-bar bar-${item.style}`,
            x: (position(index) / 100) * 1000 - width / 2,
            y: 1000 - height,
            width,
            height,
            style: `fill: ${colorVar(item.color)}`,
          })
        );
      });
    }
    data.replaceChildren(...nodes);
  }

  function drawBackdrop(): void {
    const nodes: SVGElement[] = [];
    let low = 0;
    for (const band of bands) {
      if (low >= top) {
        break;
      }
      const high = Math.min(band.limit, top);
      nodes.push(
        svg('rect', {
          class: `chart-band band-${band.key}`,
          x: 0,
          y: 1000 - (high / top) * 1000,
          width: 1000,
          height: ((high - low) / top) * 1000,
        })
      );
      low = band.limit;
    }
    const step = niceStep(top);
    const labels: HTMLElement[] = [];
    for (let value = 0; value <= top + 0.0001; value += step) {
      const y = 1000 - (value / top) * 1000;
      nodes.push(svg('line', { class: 'chart-grid', x1: 0, x2: 1000, y1: y, y2: y }));
      const label = el('span', '', String(Math.round(value * 100) / 100));
      label.style.bottom = `${(value / top) * 100}%`;
      labels.push(label);
    }
    yAxis.replaceChildren(...labels);
    backdrop.replaceChildren(...nodes);
  }
}

function scaleRow(name: string): {
  root: HTMLElement;
  set: (text: string, note: string, fraction: number, key: string, family: string) => void;
} {
  const root = el('div', 'scale-row');
  const top = el('div', 'scale-row-top');
  const label = el('span', 'scale-row-name', name);
  const value = el('span', 'scale-row-value');
  top.append(label, value);
  const track = el('div', 'scale-track');
  const fill = el('div', 'scale-fill');
  track.append(fill);
  const note = el('div', 'scale-row-note');
  root.append(top, track, note);
  return {
    root,
    set: (text, noteText, fraction, key, family) => {
      value.textContent = text;
      note.textContent = noteText;
      fill.style.width = `${Math.max(1, Math.min(100, fraction * 100))}%`;
      fill.className = `scale-fill ${family}-${key}`;
    },
  };
}

function scaleWidget(figure: HTMLElement): void {
  head(
    figure,
    'One reading, four answers',
    'Pick a PM2.5 concentration and see what each scale calls it. Drag the slider or tap one of the real readings below.'
  );
  const controls = el('div', 'widget-controls');
  const rows = el('div', 'scale-rows');
  const india = scaleRow('India (CPCB national AQI)');
  const us = scaleRow('US EPA AQI');
  const stretched = scaleRow('US AQI stretched past 500 (AQI.in, and others)');
  const who = scaleRow('WHO 24-hour guideline (15 µg/m³)');
  rows.append(india.root, us.root, stretched.root, who.root);

  const update = (value: number): void => {
    const indian = naqi(value);
    const indiaText = value > 380 ? '500, the scale ends here' : `${indian.aqi}, ${indian.label}`;
    india.set(
      indiaText,
      value > 380 ? `Anything above 380 µg/m³ reads 500.` : '',
      indian.aqi / 500,
      indian.key,
      'naqi'
    );
    const epa = epaAqi(value);
    const band = epaBand(value);
    us.set(
      value > 325.4 ? '500, "Beyond the AQI"' : `${epa}, ${band.label}`,
      value > 325.4 ? 'The EPA stops counting at 325.4 µg/m³.' : '',
      epa / 500,
      band.key,
      'band'
    );
    const stretch = stretchedAqi(value);
    stretched.set(
      String(stretch),
      stretch > 500
        ? 'Nobody defines these numbers. They just keep the last line of the EPA table going.'
        : 'Same as the EPA up to 500.',
      stretch / 1500,
      band.key,
      'band'
    );
    const times = value / 15;
    who.set(
      times < 1
        ? 'Under the guideline'
        : `${times.toFixed(times >= 10 ? 0 : 1)} times the guideline`,
      `About ${(value / 22).toFixed(value >= 22 ? 0 : 1)} cigarettes if you breathed it for a whole day (Berkeley Earth's rough rule).`,
      Math.min(1, times / 60),
      band.key,
      'band'
    );
  };

  const control = slider('PM2.5', 0, 1100, 0.5, 121, 'µg/m³', update);
  const jump = (value: number): void => {
    control.set(value);
    update(value);
  };
  controls.append(
    control.root,
    presets(
      [
        ['Leh in July, 3.3', () => jump(3.3)],
        ["Srinagar's bulletin, 11.4", () => jump(11.4)],
        ['Jammu, week before Diwali, 121', () => jump(121)],
        ['An AQI.in "1000", 576', () => jump(576)],
        ['Suchetgarh, Diwali 11:30 pm, 1,037', () => jump(1036.7)],
      ],
      'Real readings'
    )
  );
  figure.append(controls, rows);
  foot(
    figure,
    'Breakpoints from CPCB (2015) and the US EPA (2024). The 22 µg/m³ per cigarette rule is from Berkeley Earth (2015).'
  );
  update(121);
}

interface Series15 {
  name: string;
  start: number;
  step: number;
  values: (number | null)[];
}

function trailing(values: (number | null)[], points: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  let filled = 0;
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (value !== null) {
      sum += value;
      filled += 1;
    }
    if (index >= points) {
      const old = values[index - points];
      if (old !== null) {
        sum -= old;
        filled -= 1;
      }
    }
    if (index < points - 1 || filled < points * 0.75) {
      out.push(null);
    } else {
      out.push(sum / filled);
    }
  }
  return out;
}

async function windowWidget(figure: HTMLElement, source: string): Promise<void> {
  const data = (await (await fetch(source)).json()) as Series15;
  const time = (index: number): number => data.start + index * data.step;
  const diwali = data.values.findIndex(
    (_, index) => day(time(index)) === '8 Nov' && clock(time(index)) === '8:30 pm'
  );
  head(
    figure,
    'Same air, four different averages',
    `${data.name}, every 15 minutes from 5 to 11 November. Pick how long to average over. An app showing "live" AQI is near the left end, a 24-hour index like CPCB's is the right end.`
  );
  const controls = el('div', 'widget-controls');
  const readout = stats();
  const ticks: [number, string][] = [];
  data.values.forEach((_, index) => {
    const seconds = time(index);
    if (clock(seconds) === '12:00 am') {
      ticks.push([index, day(seconds)]);
    }
  });
  const plotHost = el('div', '');
  const plot = createPlot(plotHost, {
    ticks,
    unit: 'µg/m³',
    label: (index) => `${day(time(index))}, ${clock(time(index))}`,
  });

  const update = (points: string): void => {
    const size = Number(points);
    const averaged = trailing(data.values, size);
    let peak = 0;
    let peakIndex = 0;
    averaged.forEach((value, index) => {
      if (value !== null && value > peak) {
        peak = value;
        peakIndex = index;
      }
    });
    const atDiwali = averaged[diwali];
    plot.draw(
      [
        { name: '15-minute reading', color: 'muted', style: 'faint', values: data.values },
        { name: 'Average', color: 'c2', style: 'solid', values: averaged },
      ],
      950
    );
    readout.set([
      ['Highest value', `${fmt(peak)} µg/m³`, `${day(time(peakIndex))}, ${clock(time(peakIndex))}`],
      [
        'At 8:30 pm on Diwali',
        atDiwali === null ? 'no data' : `${fmt(atDiwali)} µg/m³`,
        atDiwali === null ? '' : `US AQI ${epaAqi(atDiwali)}, stretched ${stretchedAqi(atDiwali)}`,
      ],
      ['India AQI at its peak', `${naqi(peak).aqi}`, naqi(peak).label],
    ]);
  };

  controls.append(
    chips(
      [
        ['1', '15 minutes'],
        ['4', '1 hour'],
        ['32', '8 hours'],
        ['96', '24 hours'],
      ],
      '1',
      'Averaging window',
      update
    )
  );
  figure.append(controls, plotHost, readout.root);
  foot(
    figure,
    'Source: Breathe ground sensor at Gandhi Nagar (AirGradient). Each average uses the readings before it, the way a live index does.'
  );
  update('1');
}

function tankWidget(figure: HTMLElement): void {
  const city = 10;
  const leak = 1.5;
  const everyday = (121 * (4.5 + leak)) / city;
  const burstPeak = 560;
  const step = 1 / 60;
  const hours = 24;

  head(
    figure,
    'The city as a leaky tank',
    'A toy model of Jammu on Diwali night. Pollution flows in from everyday sources and from crackers, and the wind flushes the tank. Change the wind and the crackers and watch what happens.'
  );

  const burst = (hour: number): number => {
    if (hour < 6.5 || hour > 13) {
      return 0;
    }
    if (hour < 9) {
      return (hour - 6.5) / 2.5;
    }
    if (hour < 11) {
      return 1;
    }
    return (13 - hour) / 2;
  };

  const run = (wind: number, crackers: number): { with: number[]; without: number[] } => {
    const k = (wind + leak) / city;
    let withCrackers = everyday / k;
    let withoutCrackers = everyday / k;
    const outWith: number[] = [];
    const outWithout: number[] = [];
    for (let minute = 0; minute <= hours * 60; minute++) {
      const hour = minute / 60;
      if (minute % 10 === 0) {
        outWith.push(withCrackers);
        outWithout.push(withoutCrackers);
      }
      withCrackers += (everyday + burstPeak * crackers * burst(hour) - k * withCrackers) * step;
      withoutCrackers += (everyday - k * withoutCrackers) * step;
    }
    return { with: outWith, without: outWithout };
  };

  const label = (index: number): string => {
    const minutes = (12 * 60 + index * 10) % (24 * 60);
    return clock(minutes * 60) + (index * 10 >= 12 * 60 ? ', next day' : '');
  };

  const ticks: [number, string][] = [];
  for (let index = 0; index <= hours * 6; index += 18) {
    ticks.push([index, label(index).replace(':00', '').replace(', next day', '')]);
  }

  let wind = 7.6;
  let crackers = 1;
  const plotHost = el('div', '');
  const plot = createPlot(plotHost, { ticks, unit: 'µg/m³', label });
  const readout = stats();

  const update = (): void => {
    const result = run(wind, crackers);
    const peak = Math.max(...result.with);
    const average = result.with.reduce((a, b) => a + b, 0) / result.with.length;
    const baseline = result.without[0];
    const hazardous = result.with.filter((value) => value > 225.4).length / 6;
    const peakIndex = result.with.indexOf(peak);
    let recovered = -1;
    for (let index = peakIndex; index < result.with.length; index++) {
      if (result.with[index] <= baseline * 1.1) {
        recovered = index;
        break;
      }
    }
    plot.draw(
      [
        { name: 'With crackers', color: 'c2', style: 'solid', values: result.with },
        { name: 'Without crackers', color: 'muted', style: 'dashed', values: result.without },
      ],
      [300, 600, 1000, 1500, 2500].find((limit) => peak * 1.08 <= limit) ?? 2500
    );
    readout.set([
      ['Worst moment', `${fmt(peak)} µg/m³`, label(peakIndex)],
      ['Hours above 225 µg/m³', hazardous.toFixed(1), 'the EPA\'s "Hazardous"'],
      [
        'Ordinary level',
        `${fmt(baseline)} µg/m³`,
        'what this wind gives you with no crackers at all',
      ],
      ['Back to ordinary by', recovered === -1 ? 'not within a day' : label(recovered), ''],
    ]);
  };

  const windControl = slider('Wind', 0.5, 15, 0.1, wind, 'km/h', (value) => {
    wind = value;
    update();
  });
  const crackerControl = slider('Crackers', 0, 100, 5, 100, '%', (value) => {
    crackers = value / 100;
    update();
  });
  const setWind = (value: number): void => {
    wind = value;
    windControl.set(value);
    update();
  };
  const noCrackers = (): void => {
    crackers = 0;
    crackerControl.set(0);
    update();
  };
  const controls = el('div', 'widget-controls');
  controls.append(
    windControl.root,
    crackerControl.root,
    presets(
      [
        ['Diwali night, 7.6 km/h', () => setWind(7.6)],
        ['A still night, 2 km/h', () => setWind(2)],
        ['A windy night, 12 km/h', () => setWind(12)],
        ['No crackers', noCrackers],
      ],
      'Scenarios'
    )
  );
  figure.append(controls, plotHost, readout.root);
  foot(
    figure,
    "A one-box model with a 10 km city. Everyday sources are tuned so 4.5 km/h of wind gives Jammu's pre-Diwali average of 121 µg/m³. It ignores the night lid, rain and everything else, on purpose."
  );
  update();
}

function epaCorrect(pm: number, rh: number): number {
  let out: number;
  if (pm < 30) {
    out = 0.524 * pm - 0.0862 * rh + 5.75;
  } else if (pm < 50) {
    const x = pm / 20 - 1.5;
    out = (0.786 * x + 0.524 * (1 - x)) * pm - 0.0862 * rh + 5.75;
  } else if (pm < 210) {
    out = 0.786 * pm - 0.0862 * rh + 5.75;
  } else if (pm < 260) {
    const x = pm / 50 - 4.2;
    out =
      (0.69 * x + 0.786 * (1 - x)) * pm -
      0.0862 * rh * (1 - x) +
      2.966 * x +
      5.75 * (1 - x) +
      8.84e-4 * pm * pm * x;
  } else {
    out = 2.966 + 0.69 * pm + 8.84e-4 * pm * pm;
  }
  return Math.max(0, out);
}

function humidityWidget(figure: HTMLElement): void {
  head(
    figure,
    'What a laser sensor sees, and what it means',
    "Low-cost sensors count particles with a laser and guess their weight. Wet air swells particles, so the guess runs high. This is the US EPA's correction for that."
  );
  let raw = 60;
  let humidity = 50;
  const rows = el('div', 'scale-rows');
  const rawRow = scaleRow('What the sensor reports (raw)');
  const fixedRow = scaleRow('After the EPA correction');
  rows.append(rawRow.root, fixedRow.root);
  const readout = stats();

  const update = (): void => {
    const fixed = epaCorrect(raw, humidity);
    const top = Math.max(raw, fixed, 100) * 1.1;
    rawRow.set(
      `${fmt(raw)} µg/m³, US AQI ${epaAqi(raw)}`,
      epaBand(raw).label,
      raw / top,
      epaBand(raw).key,
      'band'
    );
    fixedRow.set(
      `${fmt(fixed)} µg/m³, US AQI ${epaAqi(fixed)}`,
      epaBand(fixed).label,
      fixed / top,
      epaBand(fixed).key,
      'band'
    );
    const change = ((fixed - raw) / raw) * 100;
    readout.set([
      [
        'Change',
        `${change > 0 ? '+' : ''}${change.toFixed(0)}%`,
        change > 0
          ? 'above about 340 µg/m³ the formula goes UP, not down'
          : 'the correction pulls it down',
      ],
    ]);
  };

  const rawControl = slider('Raw PM2.5', 1, 1000, 1, raw, 'µg/m³', (value) => {
    raw = value;
    update();
  });
  const humidityControl = slider('Humidity', 5, 100, 1, humidity, '%', (value) => {
    humidity = value;
    update();
  });
  const set = (nextRaw: number, nextHumidity: number): void => {
    raw = nextRaw;
    humidity = nextHumidity;
    rawControl.set(raw);
    humidityControl.set(humidity);
    update();
  };
  const controls = el('div', 'widget-controls');
  controls.append(
    rawControl.root,
    humidityControl.root,
    presets(
      [
        ['Dry Jammu afternoon', () => set(60, 35)],
        ['Foggy Srinagar morning', () => set(150, 95)],
        ['Diwali night in Jammu', () => set(900, 70)],
      ],
      'Examples'
    )
  );
  figure.append(controls, rows, readout.root);
  foot(
    figure,
    'Formula from Barkjohn et al. (2021) with the 2022 extension for smoke, as used by the EPA and by AirGradient. It was fitted on US air, not ours.'
  );
  update();
}

interface YearData {
  name: string;
  start: number;
  step: number;
  diwali: [number, number];
  baseline: number;
  baseline10: number;
  values: (number | null)[];
  values10: (number | null)[];
}

interface YearMetric {
  name: string;
  values: (number | null)[];
  baseline: number;
  india: number;
  who: number;
  hazardous: number;
  yMax: number;
  bands: Band[];
}

async function yearWidget(figure: HTMLElement, source: string): Promise<void> {
  const data = (await (await fetch(source)).json()) as YearData;
  head(
    figure,
    'What if Diwali never happened?',
    `Every hour we have recorded in ${data.name} this year, as daily averages. Take Diwali night out, or cut everyday pollution instead, and compare. Switch between PM2.5 and PM10.`
  );
  const metrics: Record<string, YearMetric> = {
    pm25: {
      name: 'PM2.5',
      values: data.values,
      baseline: data.baseline,
      india: 60,
      who: 15,
      hazardous: 225.4,
      yMax: 200,
      bands: EPA_BANDS,
    },
    pm10: {
      name: 'PM10',
      values: data.values10,
      baseline: data.baseline10,
      india: 100,
      who: 45,
      hazardous: 424,
      yMax: 250,
      bands: EPA_PM10_BANDS,
    },
  };
  let metric = metrics.pm25;
  const dayKey = (index: number): number => Math.floor((data.start + index * data.step) / 86400);
  const keys: number[] = [];
  const indexOfDay = new Map<number, number>();
  data.values.forEach((_, index) => {
    const key = dayKey(index);
    if (!indexOfDay.has(key)) {
      indexOfDay.set(key, keys.length);
      keys.push(key);
    }
  });

  let removeDiwali = false;
  let cut = 0;
  const readout = stats();
  const plotHost = el('div', '');
  const ticks: [number, string][] = [];
  keys.forEach((key, index) => {
    const date = new Date(key * 86400 * 1000);
    if (date.getUTCDate() === 1) {
      ticks.push([index, MONTHS[date.getUTCMonth()]]);
    }
  });
  const plot = createPlot(plotHost, {
    bars: true,
    height: 200,
    ticks,
    unit: 'µg/m³',
    label: (index) => day(keys[index] * 86400),
  });

  const summarise = (
    values: (number | null)[],
    limits: YearMetric
  ): { mean: number; daily: (number | null)[]; india: number; who: number; hazardous: number } => {
    const sums = keys.map(() => 0);
    const counts = keys.map(() => 0);
    let total = 0;
    let n = 0;
    let hazardous = 0;
    values.forEach((value, index) => {
      if (value === null) {
        return;
      }
      const slot = indexOfDay.get(dayKey(index)) as number;
      sums[slot] += value;
      counts[slot] += 1;
      total += value;
      n += 1;
      if (value > limits.hazardous) {
        hazardous += 1;
      }
    });
    const daily = sums.map((sum, index) => (counts[index] >= 18 ? sum / counts[index] : null));
    const full = daily.filter((value): value is number => value !== null);
    return {
      mean: total / n,
      daily,
      india: full.filter((value) => value > limits.india).length,
      who: full.filter((value) => value <= limits.who).length,
      hazardous,
    };
  };

  const update = (): void => {
    const actual = summarise(metric.values, metric);
    const changed = metric.values.map((value, index) => {
      if (value === null) {
        return null;
      }
      let next = value;
      if (removeDiwali && index >= data.diwali[0] && index < data.diwali[1]) {
        next = Math.min(next, metric.baseline);
      }
      return next * (1 - cut / 100);
    });
    const result = summarise(changed, metric);
    plot.draw(
      [
        { name: 'As recorded', color: 'muted', style: 'faint', values: actual.daily },
        { name: 'Your version', color: 'jammu', style: 'solid', values: result.daily },
      ],
      metric.yMax,
      metric.bands
    );
    const delta = result.mean - actual.mean;
    readout.set([
      [
        `Average ${metric.name} for the year`,
        `${result.mean.toFixed(1)} µg/m³`,
        delta === 0 ? 'as recorded' : `${delta.toFixed(1)} from what we recorded`,
      ],
      [
        `Days over India's limit (${metric.india})`,
        String(result.india),
        `of ${actual.daily.filter((value) => value !== null).length}, recorded ${actual.india}`,
      ],
      [`Days within WHO's guideline (${metric.who})`, String(result.who), `recorded ${actual.who}`],
      [
        `Hours above ${Math.round(metric.hazardous)} µg/m³`,
        String(result.hazardous),
        `recorded ${actual.hazardous}, the EPA's "Hazardous"`,
      ],
    ]);
  };

  const controls = el('div', 'widget-controls');
  const toggle = el('button', 'widget-chip', 'Take out Diwali night') as HTMLButtonElement;
  toggle.type = 'button';
  toggle.setAttribute('aria-pressed', 'false');
  toggle.addEventListener('click', () => {
    removeDiwali = !removeDiwali;
    toggle.setAttribute('aria-pressed', String(removeDiwali));
    update();
  });
  const toggleRow = el('div', 'widget-chips');
  toggleRow.append(toggle);
  const cutControl = slider('Cut everyday pollution by', 0, 60, 1, 0, '%', (value) => {
    cut = value;
    update();
  });
  const metricChips = chips(
    [
      ['pm25', 'PM2.5'],
      ['pm10', 'PM10'],
    ],
    'pm25',
    'Pollutant',
    (value) => {
      metric = metrics[value];
      update();
    }
  );
  controls.append(metricChips, toggleRow, cutControl.root);
  figure.append(controls, plotHost, readout.root);
  foot(
    figure,
    `Source: Breathe ground sensors in ${data.name} (AirGradient), ${day(data.start)} to ${day(data.start + (data.values.length - 1) * data.step)} 2026. "Taking out Diwali" caps 5 pm on 8 November to 9 am on 9 November at the week's average, ${data.baseline} µg/m³ of PM2.5 and ${data.baseline10} of PM10. Limits are 24-hour ones. Our laser sensors undercount coarse dust, so the PM10 here is on the low side.`
  );
  update();
}

function doseWidget(figure: HTMLElement): void {
  head(
    figure,
    'How much did you actually breathe in?',
    'Concentration is only half of it. The other half is how long you were in it and how hard you were breathing. Pick the air, the time and what you were doing.'
  );
  const rates: Record<string, number> = { rest: 0.26, light: 0.72, active: 1.6 };
  const daily = 16;
  const who = 15;
  let concentration = 500;
  let hours = 4;
  let activity = 'light';
  const readout = stats();

  const update = (): void => {
    const breathed = rates[activity] * hours;
    const dose = breathed * concentration;
    const whoDay = who * daily;
    const jammuDay = 121 * daily;
    readout.set([
      [
        'Air you breathed',
        `${breathed.toFixed(1)} m³`,
        `about ${Math.round(breathed * 1000)} litres`,
      ],
      [
        'PM2.5 that came with it',
        `${Math.round(dose).toLocaleString('en-IN')} µg`,
        `${(dose / 1000).toFixed(2)} milligrams`,
      ],
      ['Same as', `${(dose / whoDay).toFixed(1)} days`, 'of breathing air at the WHO guideline'],
      ['Or', `${(dose / jammuDay).toFixed(2)} days`, 'of an ordinary early November day in Jammu'],
    ]);
  };

  const concentrationControl = slider(
    'PM2.5 in the air',
    1,
    1000,
    1,
    concentration,
    'µg/m³',
    (value) => {
      concentration = value;
      update();
    }
  );
  const hourControl = slider('Time spent in it', 0.25, 24, 0.25, hours, 'hours', (value) => {
    hours = value;
    update();
  });
  const pick = (value: number, time: number): void => {
    concentration = value;
    hours = time;
    concentrationControl.set(value);
    hourControl.set(time);
    update();
  };
  const controls = el('div', 'widget-controls');
  controls.append(
    concentrationControl.root,
    hourControl.root,
    chips(
      [
        ['rest', 'Sitting or sleeping'],
        ['light', 'Standing, walking around'],
        ['active', 'Running, cycling'],
      ],
      activity,
      'Activity',
      (value) => {
        activity = value;
        update();
      }
    ),
    presets(
      [
        ['Diwali evening outside in Jammu', () => pick(500, 4)],
        ['A whole November day in Jammu', () => pick(121, 24)],
        ['A whole July day in Leh', () => pick(3.3, 24)],
        ['A morning walk in Srinagar', () => pick(150, 1)],
      ],
      'Examples'
    )
  );
  figure.append(controls, readout.root);
  foot(
    figure,
    'Breathing rates from the US EPA Exposure Factors Handbook (2011), adults: about 16 m³ a day overall, 0.26 m³ an hour sitting, 0.72 m³ an hour at light activity, 1.6 m³ an hour at moderate activity. Indoors, outdoor air leaks in, but not all of it.'
  );
  update();
}

export function initWidgets(): void {
  for (const figure of document.querySelectorAll<HTMLElement>('figure.widget')) {
    const name = figure.dataset.widget;
    const source = figure.dataset.src ?? '';
    figure.replaceChildren();
    figure.classList.add('chart');
    try {
      if (name === 'scale') {
        scaleWidget(figure);
      } else if (name === 'window') {
        windowWidget(figure, source).catch((error) => {
          console.warn('Widget failed', name, error);
        });
      } else if (name === 'tank') {
        tankWidget(figure);
      } else if (name === 'humidity') {
        humidityWidget(figure);
      } else if (name === 'dose') {
        doseWidget(figure);
      } else if (name === 'year') {
        yearWidget(figure, source).catch((error) => {
          console.warn('Widget failed', name, error);
        });
      }
    } catch (error) {
      console.warn('Widget failed', name, error);
    }
  }
}
