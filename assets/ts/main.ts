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

  const setActive = (): void => {
    let current = headings[0];
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top <= 120) {
        current = heading;
      }
    }
    for (const link of links) {
      link.classList.toggle('active', link === byId.get(current.id));
    }
  };

  let frame = 0;
  window.addEventListener(
    'scroll',
    () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(setActive);
    },
    { passive: true }
  );
  setActive();
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

initTheme();
initMenu();
initArchiveFilter();
initToc();
initCodeCopy();
initEasterEgg();
