const STORAGE_KEY_THEME = 'theme';

let themeChangeTimer = 0;

function initTheme(): void {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) {
    return;
  }

  toggle.addEventListener('click', () => {
    const root = document.documentElement;
    const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';

    root.classList.add('theme-changing');
    window.clearTimeout(themeChangeTimer);
    themeChangeTimer = window.setTimeout(() => {
      root.classList.remove('theme-changing');
    }, 550);

    root.setAttribute('data-theme', next);
    try {
      localStorage.setItem(STORAGE_KEY_THEME, next);
    } catch (error) {
      console.warn('Could not save theme', error);
    }
  });
}

function initMenu(): void {
  const toggle = document.getElementById('menu-toggle');
  const menu = document.getElementById('nav-menu');
  if (!toggle || !menu) {
    return;
  }

  const setOpen = (open: boolean): void => {
    menu.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };

  toggle.addEventListener('click', (event: Event) => {
    event.stopPropagation();
    setOpen(!menu.classList.contains('open'));
  });

  document.addEventListener('click', (event: Event) => {
    if (!menu.contains(event.target as Node)) {
      setOpen(false);
    }
  });

  document.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      setOpen(false);
    }
  });
}

function initArchiveFilter(): void {
  const filter = document.getElementById('archive-filter');
  if (!filter) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const category = params.get('category');
  const tag = params.get('tag');
  if (!category && !tag) {
    return;
  }

  const posts = Array.from(document.querySelectorAll<HTMLElement>('.archive-post'));
  const visibleByYear = new Map<string, number>();

  for (const post of posts) {
    const tags = (post.dataset.tags ?? '').split('|');
    const matches = category ? post.dataset.category === category : tags.includes(tag ?? '');
    post.classList.toggle('hidden', !matches);
    if (matches) {
      const year = post.dataset.year ?? '';
      visibleByYear.set(year, (visibleByYear.get(year) ?? 0) + 1);
    }
  }

  for (const year of document.querySelectorAll<HTMLElement>('.archive-year')) {
    const count = visibleByYear.get(year.dataset.year ?? '') ?? 0;
    year.classList.toggle('hidden', count === 0);
    const label = year.querySelector('.archive-count');
    if (label) {
      label.textContent = `${count} ${count === 1 ? 'post' : 'posts'}`;
    }
  }

  const value = document.getElementById('archive-filter-value');
  if (value) {
    value.textContent = category ? category : `#${tag}`;
  }
  filter.classList.add('visible');

  const empty = document.getElementById('archive-empty');
  if (empty && visibleByYear.size === 0) {
    empty.classList.add('visible');
  }
}

const TOC_ACTIVE_ZONE = 0.3;
const TOC_LOCK_FALLBACK_MS = 1200;

function initToc(): void {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.toc a'));
  if (links.length === 0) {
    return;
  }

  const byId = new Map<string, HTMLAnchorElement>();
  const headings: HTMLElement[] = [];
  for (const link of links) {
    const id = decodeURIComponent(link.hash.slice(1));
    const heading = document.getElementById(id);
    if (heading) {
      byId.set(id, link);
      headings.push(heading);
    }
  }
  if (headings.length === 0) {
    return;
  }

  let lockedId = '';
  let unlockTimer = 0;

  const highlight = (id: string): void => {
    const active = byId.get(id);
    for (const link of links) {
      link.classList.toggle('active', link === active);
    }
  };

  const update = (): void => {
    if (lockedId) {
      return;
    }
    const root = document.documentElement;
    const atBottom = window.scrollY + window.innerHeight >= root.scrollHeight - 4;
    let current = headings[0];
    if (atBottom) {
      current = headings[headings.length - 1];
    } else {
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= window.innerHeight * TOC_ACTIVE_ZONE) {
          current = heading;
        }
      }
    }
    highlight(current.id);
  };

  const unlock = (): void => {
    window.clearTimeout(unlockTimer);
    lockedId = '';
  };

  for (const link of links) {
    link.addEventListener('click', () => {
      lockedId = decodeURIComponent(link.hash.slice(1));
      highlight(lockedId);
      window.clearTimeout(unlockTimer);
      unlockTimer = window.setTimeout(unlock, TOC_LOCK_FALLBACK_MS);
    });
  }

  let frame = 0;
  window.addEventListener(
    'scroll',
    () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    },
    { passive: true }
  );
  window.addEventListener('scrollend', () => {
    if (lockedId) {
      unlock();
    }
  });
  window.addEventListener('resize', update);
  update();
}

function initCodeCopy(): void {
  for (const pre of document.querySelectorAll<HTMLPreElement>('.prose pre')) {
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block';
    pre.replaceWith(wrapper);
    wrapper.appendChild(pre);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-btn';
    button.textContent = 'Copy';
    wrapper.appendChild(button);

    let resetTimer = 0;
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pre.innerText);
        button.textContent = 'Copied';
        button.classList.add('copied');
      } catch (error) {
        button.textContent = 'Failed';
      }
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        button.textContent = 'Copy';
        button.classList.remove('copied');
      }, 1600);
    });
  }
}

const TOAST_SHORT_MS = 2000;
const TOAST_LONG_MS = 3500;
const TOAST_SWAP_MS = 250;

let toastVisible = false;
let toastHideTimer = 0;
let toastSwapTimer = 0;

function createToast(): HTMLElement {
  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = '<img src="/images/logo-mark.png" alt="" /><span></span>';
  document.body.appendChild(toast);
  return toast;
}

function showToast(message: string, duration: number): void {
  const toast = document.getElementById('toast') ?? createToast();
  const text = toast.querySelector('span');

  const reveal = (): void => {
    if (text) {
      text.textContent = message;
    }
    void toast.offsetWidth;
    toast.classList.add('show');
    toastVisible = true;
    toastHideTimer = window.setTimeout(() => {
      toast.classList.remove('show');
      toastVisible = false;
    }, duration);
  };

  window.clearTimeout(toastHideTimer);
  window.clearTimeout(toastSwapTimer);

  if (toastVisible) {
    toast.classList.remove('show');
    toastSwapTimer = window.setTimeout(reveal, TOAST_SWAP_MS);
    return;
  }
  reveal();
}

// Breathe, breathe in the air. Don't be afraid to care.
const EASTER_EGG_LINE = "Breathe, breathe in the air. Don't be afraid to care.";
const EASTER_EGG_TRIBUTE = 'Shine on, you crazy diamond!';
const EASTER_EGG_TAPS = 5;
const EASTER_EGG_RESET_MS = 1500;

let easterEggCounter = 0;
let easterEggResetTimer = 0;
let easterEggDone = false;

function initEasterEgg(): void {
  const logo = document.getElementById('logo-egg');
  if (!logo) {
    return;
  }

  logo.addEventListener('click', () => {
    // Once is enough until the next refresh
    if (easterEggDone) {
      return;
    }

    easterEggCounter++;

    // Taps only count when they come in a row
    window.clearTimeout(easterEggResetTimer);
    easterEggResetTimer = window.setTimeout(() => {
      easterEggCounter = 0;
    }, EASTER_EGG_RESET_MS);

    if (easterEggCounter >= EASTER_EGG_TAPS) {
      easterEggCounter = 0;
      easterEggDone = true;

      // Shine on, you crazy diamond!
      // Tribute
      showToast(EASTER_EGG_TRIBUTE, TOAST_LONG_MS);
      return;
    }

    // Let the lyric finish before it can show again
    if (toastVisible) {
      return;
    }
    showToast(EASTER_EGG_LINE, TOAST_SHORT_MS);
  });
}

function initReadProgress(): void {
  const bar = document.getElementById('read-progress');
  const article = document.querySelector<HTMLElement>('.article');
  if (!bar || !article) {
    return;
  }

  const update = (): void => {
    const start = article.offsetTop;
    const end = start + article.offsetHeight - window.innerHeight;
    const progress = end <= start ? 1 : (window.scrollY - start) / (end - start);
    bar.style.width = `${Math.min(1, Math.max(0, progress)) * 100}%`;
  };

  let frame = 0;
  const schedule = (): void => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(update);
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  update();
}

interface ChartSeriesData {
  name: string;
  color: string;
  values: (number | null)[];
}

interface ChartData {
  kind: 'line' | 'bar';
  unit: string;
  categories: boolean;
  labels: string[];
  panels: { title: string | null; yMax: number; series: ChartSeriesData[] }[];
}

interface ChartOverlay {
  plot: HTMLElement;
  crosshair: HTMLElement;
  tooltip: HTMLElement;
  dots: HTMLElement[];
}

const EPA_CATEGORIES: [number, string][] = [
  [9, 'Good'],
  [35.4, 'Moderate'],
  [55.4, 'Unhealthy for sensitive groups'],
  [125.4, 'Unhealthy'],
  [225.4, 'Very unhealthy'],
];

function epaCategory(value: number): string {
  for (const [limit, label] of EPA_CATEGORIES) {
    if (value <= limit) {
      return label;
    }
  }
  return 'Hazardous';
}

function chartColor(color: string): string {
  if (color === 'muted') {
    return 'var(--on-surface-variant)';
  }
  return `var(--chart-${color})`;
}

function element(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function tooltipContent(data: ChartData, panelIndex: number, index: number): HTMLElement[] {
  const panel = data.panels[panelIndex];
  const heading = panel.title ? `${panel.title}, ${data.labels[index]}` : data.labels[index];
  const nodes: HTMLElement[] = [element('div', 'chart-tooltip-title', heading)];
  const categories: string[] = [];

  for (const series of panel.series) {
    const value = series.values[index];
    const row = element('div', 'chart-tooltip-row');
    const swatch = element('span', 'chart-swatch');
    swatch.style.setProperty('--c', chartColor(series.color));
    row.append(swatch, element('span', '', series.name));
    const text =
      value === null || value === undefined ? 'no data' : `${value.toFixed(1)} ${data.unit}`;
    row.append(element('span', 'chart-tooltip-value', text));
    nodes.push(row);

    if (data.categories && value !== null && value !== undefined) {
      const prefix = panel.series.length > 1 ? `${series.name}: ` : '';
      categories.push(`${prefix}${epaCategory(value)}`);
    }
  }

  if (categories.length > 0) {
    nodes.push(element('div', 'chart-tooltip-category', categories.join(' · ')));
  }
  return nodes;
}

function initCharts(): void {
  for (const figure of document.querySelectorAll<HTMLElement>('figure.chart')) {
    const script = figure.querySelector('script.chart-data');
    if (!script || !script.textContent) {
      continue;
    }

    const data = JSON.parse(script.textContent) as ChartData;
    const count = data.labels.length;
    const banded = data.categories || data.kind === 'bar';
    const bars = Array.from(figure.querySelectorAll<SVGElement>('.chart-bar'));
    const overlays: ChartOverlay[] = Array.from(
      figure.querySelectorAll<HTMLElement>('.chart-plot')
    ).map((plot) => {
      const crosshair = element('div', 'chart-crosshair');
      const tooltip = element('div', 'chart-tooltip');
      crosshair.hidden = true;
      tooltip.hidden = true;
      tooltip.setAttribute('role', 'status');
      plot.append(crosshair, tooltip);
      return { plot, crosshair, tooltip, dots: [] };
    });
    let current = -1;

    const position = (index: number): number => {
      if (banded) {
        return ((index + 0.5) / count) * 100;
      }
      if (count <= 1) {
        return 50;
      }
      return (index / (count - 1)) * 100;
    };

    const indexAt = (plot: HTMLElement, clientX: number): number => {
      const rect = plot.getBoundingClientRect();
      const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      if (banded) {
        return Math.min(count - 1, Math.floor(fraction * count));
      }
      return Math.round(fraction * (count - 1));
    };

    const clearDots = (overlay: ChartOverlay): void => {
      for (const dot of overlay.dots) {
        dot.remove();
      }
      overlay.dots.length = 0;
    };

    const hide = (): void => {
      current = -1;
      figure.classList.remove('is-active');
      for (const bar of bars) {
        bar.classList.remove('is-current');
      }
      for (const overlay of overlays) {
        overlay.crosshair.hidden = true;
        overlay.tooltip.hidden = true;
        clearDots(overlay);
      }
    };

    const show = (index: number, activePanel: number): void => {
      current = index;
      const left = position(index);
      figure.classList.toggle('is-active', data.kind === 'bar');
      for (const bar of bars) {
        bar.classList.toggle('is-current', bar.getAttribute('data-i') === String(index));
      }

      overlays.forEach((overlay, panelIndex) => {
        const panel = data.panels[panelIndex];
        clearDots(overlay);

        if (data.kind === 'line') {
          overlay.crosshair.hidden = false;
          overlay.crosshair.style.left = `${left}%`;
          for (const series of panel.series) {
            const value = series.values[index];
            if (value === null || value === undefined) {
              continue;
            }
            const dot = element('span', 'chart-dot');
            dot.style.left = `${left}%`;
            dot.style.top = `${100 - (Math.min(value, panel.yMax) / panel.yMax) * 100}%`;
            dot.style.setProperty('--c', chartColor(series.color));
            overlay.plot.append(dot);
            overlay.dots.push(dot);
          }
        }

        if (panelIndex !== activePanel) {
          overlay.tooltip.hidden = true;
          return;
        }

        overlay.tooltip.replaceChildren(...tooltipContent(data, panelIndex, index));
        overlay.tooltip.hidden = false;
        const plotWidth = overlay.plot.clientWidth;
        const tooltipWidth = overlay.tooltip.offsetWidth;
        const x = (left / 100) * plotWidth;
        let offset = x + 12;
        if (offset + tooltipWidth > plotWidth) {
          offset = x - 12 - tooltipWidth;
        }
        offset = Math.max(0, Math.min(offset, plotWidth - tooltipWidth));
        overlay.tooltip.style.left = `${offset}px`;
      });
    };

    overlays.forEach((overlay, panelIndex) => {
      overlay.plot.addEventListener('pointermove', (event: PointerEvent) => {
        show(indexAt(overlay.plot, event.clientX), panelIndex);
      });
      overlay.plot.addEventListener('pointerdown', (event: PointerEvent) => {
        show(indexAt(overlay.plot, event.clientX), panelIndex);
      });
      overlay.plot.addEventListener('pointerleave', (event: PointerEvent) => {
        if (event.pointerType === 'mouse' && document.activeElement !== overlay.plot) {
          hide();
        }
      });
      overlay.plot.addEventListener('focus', () => {
        show(current >= 0 ? current : 0, panelIndex);
      });
      overlay.plot.addEventListener('blur', hide);
      overlay.plot.addEventListener('keydown', (event: KeyboardEvent) => {
        const step = event.shiftKey ? 10 : 1;
        let next = current < 0 ? 0 : current;
        if (event.key === 'ArrowRight') {
          next = Math.min(count - 1, next + step);
        } else if (event.key === 'ArrowLeft') {
          next = Math.max(0, next - step);
        } else if (event.key === 'Home') {
          next = 0;
        } else if (event.key === 'End') {
          next = count - 1;
        } else if (event.key === 'Escape') {
          overlay.plot.blur();
          return;
        } else {
          return;
        }
        event.preventDefault();
        show(next, panelIndex);
      });
    });

    document.addEventListener('pointerdown', (event: PointerEvent) => {
      if (!figure.contains(event.target as Node)) {
        hide();
      }
    });
  }
}

initTheme();
initMenu();
initArchiveFilter();
initToc();
initCodeCopy();
initEasterEgg();
initReadProgress();
initCharts();
