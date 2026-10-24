import { LINKS, SITE, type Heading, type Post } from './config.ts';
import { icon } from './icons.ts';

export type NavKey = 'home' | 'archive' | 'none';

export interface Taxonomy {
  name: string;
  count: number;
}

interface LayoutOptions {
  title: string;
  description: string;
  path: string;
  content: string;
  sidebar: string;
  active: NavKey;
  version: string;
  image?: string;
  type?: 'website' | 'article';
  jsonLd?: object;
  noindex?: boolean;
}

export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function postPath(post: Post): string {
  return `/posts/${post.slug}/`;
}

function absolute(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  return `${SITE.url}${path}`;
}

function archiveLink(key: 'category' | 'tag', value: string): string {
  return `/archive/?${key}=${encodeURIComponent(value)}`;
}

export function layout(options: LayoutOptions): string {
  const url = absolute(options.path);
  const image = absolute(options.image ?? '/images/social_preview.png');
  const fullTitle = options.title === SITE.title ? SITE.title : `${options.title} | ${SITE.title}`;
  const jsonLd = options.jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(options.jsonLd)}</script>`
    : '';
  const robots = options.noindex ? '<meta name="robots" content="noindex" />' : '';

  return `<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(fullTitle)}</title>
    <meta name="description" content="${esc(options.description)}" />
    <link rel="canonical" href="${url}" />
    ${robots}
    <meta property="og:site_name" content="${SITE.title}" />
    <meta property="og:title" content="${esc(options.title)}" />
    <meta property="og:description" content="${esc(options.description)}" />
    <meta property="og:type" content="${options.type ?? 'website'}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${image}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(options.title)}" />
    <meta name="twitter:description" content="${esc(options.description)}" />
    <meta name="twitter:image" content="${image}" />
    <meta name="theme-color" content="#a8c7fa" />
    <link rel="icon" type="image/webp" href="/images/web-icon.webp" />
    <link rel="apple-touch-icon" sizes="180x180" href="/images/apple-touch-icon.png" />
    <link rel="alternate" type="application/rss+xml" title="${SITE.title}" href="/rss.xml" />
    <script>
      try {
        document.documentElement.setAttribute('data-theme', localStorage.getItem('theme') || 'dark');
      } catch (error) {}
    </script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Roboto+Mono:wght@400;500&display=swap"
      rel="stylesheet" />
    <link rel="stylesheet" href="/assets/css/styles.css?v=${options.version}" />
    <script type="module" src="/assets/js/main.js?v=${options.version}"></script>
    ${jsonLd}
  </head>
  <body>
    ${navbar(options.active)}
    <div class="page layout">
      <main class="content">${options.content}</main>
      <aside class="sidebar">${options.sidebar}</aside>
    </div>
    ${footer()}
  </body>
</html>
`;
}

function navbar(active: NavKey): string {
  const internal = [
    { key: 'home', label: 'Home', href: '/' },
    { key: 'archive', label: 'Archive', href: '/archive/' },
  ];
  const external = [
    { label: 'About', href: LINKS.about },
    { label: 'App', href: LINKS.app },
    { label: 'GitHub', href: LINKS.github },
  ];

  const desktop = [
    ...internal.map((link) => {
      const current = link.key === active ? ' active' : '';
      return `<a class="nav-link${current}" href="${link.href}">${link.label}</a>`;
    }),
    ...external.map((link) => {
      return `<a class="nav-link" href="${link.href}" target="_blank" rel="noopener">${link.label}${icon('external')}</a>`;
    }),
  ].join('');

  const mobile = [
    ...internal.map((link) => {
      const current = link.key === active ? ' class="active"' : '';
      return `<a${current} href="${link.href}">${link.label}${icon('chevronRight')}</a>`;
    }),
    ...external.map((link) => {
      return `<a href="${link.href}" target="_blank" rel="noopener">${link.label}${icon('external')}</a>`;
    }),
  ].join('');

  return `<header class="navbar">
      <nav class="navbar-inner" aria-label="Main">
        <a class="brand" href="/" aria-label="Breathe Blog home" title="Home">
          <img src="/images/logo-mark.png" alt="" width="54" height="40" />
        </a>
        <div class="nav-links">${desktop}</div>
        <div class="nav-actions">
          <a class="icon-btn" href="/rss.xml" aria-label="RSS feed" title="RSS feed">${icon('rss')}</a>
          <button class="icon-btn" id="theme-toggle" type="button" aria-label="Toggle theme" title="Toggle theme">
            ${icon('sun', 'theme-icon-dark')}${icon('moon', 'theme-icon-light')}
          </button>
          <button class="icon-btn" id="menu-toggle" type="button" aria-label="Menu" aria-expanded="false" aria-controls="nav-menu">${icon('menu')}</button>
        </div>
        <div class="nav-menu" id="nav-menu">${mobile}</div>
      </nav>
    </header>`;
}

function footer(): string {
  const year = new Date().getUTCFullYear();
  return `<footer class="footer">
      <div class="footer-inner">
        <p>&copy; ${year} <a href="${LINKS.about}">BreatheOSS</a>. Code under the MIT License.</p>
        <div class="footer-links">
          <a href="/rss.xml">RSS</a>
          <a href="/sitemap.xml">Sitemap</a>
          <a href="${SITE.repo}" target="_blank" rel="noopener">Source</a>
          <a href="${LINKS.app}" target="_blank" rel="noopener">breatheoss.app</a>
        </div>
      </div>
    </footer>`;
}

function profileCard(): string {
  const socials = [
    { label: 'GitHub', href: LINKS.github, icon: icon('github') },
    { label: 'Discord', href: LINKS.discord, icon: icon('discord') },
    { label: 'Instagram', href: LINKS.instagram, icon: icon('instagram') },
    { label: 'Email', href: LINKS.email, icon: icon('mail') },
  ]
    .map((social) => {
      return `<a class="social-btn" href="${social.href}" target="_blank" rel="noopener me" aria-label="${social.label}" title="${social.label}">${social.icon}</a>`;
    })
    .join('');

  return `<section class="surface profile reveal">
      <button class="profile-banner" id="logo-egg" type="button" aria-label="Breathe">
        <img src="/images/logo-mark.png" alt="" width="194" height="144" />
      </button>
      <h2 class="profile-name">${SITE.name}</h2>
      <div class="accent-bar"></div>
      <p class="profile-tagline">${esc(SITE.tagline)}</p>
      <div class="socials">${socials}</div>
    </section>`;
}

function categoriesWidget(categories: Taxonomy[]): string {
  if (categories.length === 0) {
    return '';
  }
  const rows = categories
    .map((category) => {
      return `<a class="category-row" href="${archiveLink('category', category.name)}">
          <span class="category-name">${esc(category.name)}</span>
          <span class="count">${category.count}</span>
        </a>`;
    })
    .join('');
  return `<section class="surface widget reveal" style="--i: 1">
      <h2 class="widget-title">Categories</h2>
      ${rows}
    </section>`;
}

function tagsWidget(tags: Taxonomy[]): string {
  if (tags.length === 0) {
    return '';
  }
  const chips = tags
    .map((tag) => {
      return `<a class="chip" href="${archiveLink('tag', tag.name)}">${esc(tag.name)}</a>`;
    })
    .join('');
  return `<section class="surface widget reveal" style="--i: 2">
      <h2 class="widget-title">Tags</h2>
      <div class="chips">${chips}</div>
    </section>`;
}

function tocWidget(headings: Heading[]): string {
  if (headings.length === 0) {
    return '';
  }
  const links = headings
    .map((heading) => {
      return `<a class="depth-${heading.depth}" href="#${heading.id}">${esc(heading.text)}</a>`;
    })
    .join('');
  return `<section class="surface widget toc-widget reveal" style="--i: 1">
      <h2 class="widget-title">Contents</h2>
      <nav class="toc" aria-label="Table of contents">${links}</nav>
    </section>`;
}

export function listSidebar(categories: Taxonomy[], tags: Taxonomy[]): string {
  return `${profileCard()}
    <div class="sidebar-sticky">${categoriesWidget(categories)}${tagsWidget(tags)}</div>`;
}

export function postSidebar(post: Post): string {
  return `${profileCard()}
    <div class="sidebar-sticky">${tocWidget(post.headings)}</div>`;
}

function postMeta(post: Post): string {
  const tags =
    post.tags.length > 0
      ? `<span class="meta-item">
          <span class="meta-icon">${icon('tag')}</span>
          <span>${post.tags
            .map((tag) => {
              return `<a href="${archiveLink('tag', tag)}">${esc(tag)}</a>`;
            })
            .join('<span class="meta-sep">/</span>')}</span>
        </span>`
      : '';

  const draft = post.draft ? '<span class="draft-badge">Draft</span>' : '';

  return `<div class="meta">
      ${draft}
      <span class="meta-item">
        <span class="meta-icon">${icon('calendar')}</span>
        <time datetime="${isoDate(post.published)}">${formatDate(post.published)}</time>
      </span>
      <span class="meta-item">
        <span class="meta-icon">${icon('folder')}</span>
        <a href="${archiveLink('category', post.category)}">${esc(post.category)}</a>
      </span>
      ${tags}
    </div>`;
}

function stats(post: Post): string {
  return `<div class="stats">
      <span>${post.words.toLocaleString('en-US')} words</span>
      <span class="meta-sep">|</span>
      <span>${post.minutes} min read</span>
    </div>`;
}

export function postCard(post: Post, index: number): string {
  const side = post.cover
    ? `<div class="post-card-cover"><img src="${post.cover}" alt="" loading="lazy" /></div>`
    : `<div class="post-card-enter" aria-hidden="true">${icon('chevronRight')}</div>`;

  return `<article class="surface post-card reveal" style="--i: ${index}">
      <div class="post-card-body">
        <h2 class="post-card-title"><a href="${postPath(post)}">${esc(post.title)}</a>${icon('chevronRight')}</h2>
        ${postMeta(post)}
        <p class="post-card-desc">${esc(post.description)}</p>
        ${stats(post)}
      </div>
      ${side}
    </article>`;
}

export function pagination(current: number, total: number): string {
  if (total <= 1) {
    return '';
  }
  const href = (page: number): string => {
    return page === 1 ? '/' : `/page/${page}/`;
  };
  const numbers: string[] = [];
  for (let page = 1; page <= total; page++) {
    const state = page === current ? ' current" aria-current="page' : '';
    numbers.push(`<a class="page-btn${state}" href="${href(page)}">${page}</a>`);
  }
  const prev =
    current > 1
      ? `<a class="page-btn" href="${href(current - 1)}" aria-label="Newer posts">${icon('chevronLeft')}</a>`
      : `<span class="page-btn disabled">${icon('chevronLeft')}</span>`;
  const next =
    current < total
      ? `<a class="page-btn" href="${href(current + 1)}" aria-label="Older posts">${icon('chevronRight')}</a>`
      : `<span class="page-btn disabled">${icon('chevronRight')}</span>`;
  return `<nav class="pagination" aria-label="Pagination">${prev}${numbers.join('')}${next}</nav>`;
}

export function emptyList(): string {
  return `<section class="surface empty-state reveal">
      <p class="empty-state-code">0</p>
      <p>No posts yet. The first one is on its way.</p>
    </section>`;
}

export function postPage(post: Post, newer?: Post, older?: Post): string {
  const cover = post.cover
    ? `<div class="article-cover"><img src="${post.cover}" alt="" /></div>`
    : '';
  const updated = post.updated
    ? `<div>
          <div class="article-info-label">Updated</div>
          <div class="article-info-value">${formatDate(post.updated)}</div>
        </div>`
    : '';

  const nav: string[] = [];
  if (newer) {
    nav.push(`<a class="surface post-nav-link prev" href="${postPath(newer)}">
        ${icon('chevronLeft')}
        <div class="post-nav-text">
          <div class="post-nav-label">Newer</div>
          <div class="post-nav-title">${esc(newer.title)}</div>
        </div>
      </a>`);
  }
  if (older) {
    nav.push(`<a class="surface post-nav-link next" href="${postPath(older)}">
        ${icon('chevronRight')}
        <div class="post-nav-text">
          <div class="post-nav-label">Older</div>
          <div class="post-nav-title">${esc(older.title)}</div>
        </div>
      </a>`);
  }
  const postNav =
    nav.length > 0 ? `<nav class="post-nav reveal" style="--i: 1">${nav.join('')}</nav>` : '';

  return `<article class="surface article reveal">
      ${postMeta(post)}
      <h1 class="article-title">${esc(post.title)}</h1>
      <p class="article-desc">${esc(post.description)}</p>
      ${stats(post)}
      <hr class="divider" />
      ${cover}
      <div class="prose">${post.html}</div>
      <div class="article-info">
        <div class="article-info-head">
          <div class="article-info-title">${esc(post.title)}</div>
          <div class="article-info-url">${absolute(postPath(post))}</div>
        </div>
        <div>
          <div class="article-info-label">Author</div>
          <div class="article-info-value">${esc(post.author)}</div>
        </div>
        <div>
          <div class="article-info-label">Published</div>
          <div class="article-info-value">${formatDate(post.published)}</div>
        </div>
        ${updated}
        <div>
          <div class="article-info-label">Source</div>
          <div class="article-info-value"><a href="${SITE.repo}/blob/main/posts/${post.file}" target="_blank" rel="noopener">Edit on GitHub</a></div>
        </div>
      </div>
    </article>
    ${postNav}`;
}

export function archivePage(posts: Post[]): string {
  const years = new Map<number, Post[]>();
  for (const post of posts) {
    const year = post.published.getUTCFullYear();
    const list = years.get(year) ?? [];
    list.push(post);
    years.set(year, list);
  }

  const groups = [...years.entries()]
    .map(([year, list]) => {
      const rows = list
        .map((post) => {
          const date = post.published.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC',
          });
          const tags = post.tags.map((tag) => `#${esc(tag)}`).join(' ');
          return `<a class="archive-row archive-post" href="${postPath(post)}" data-category="${esc(post.category)}" data-tags="${esc(post.tags.join('|'))}" data-year="${year}">
              <span class="archive-date">${date}</span>
              <span class="archive-dot"></span>
              <span class="archive-title">${esc(post.title)}</span>
              <span class="archive-tags">${tags}</span>
            </a>`;
        })
        .join('');
      const label = list.length === 1 ? 'post' : 'posts';
      return `<div class="archive-row archive-year" data-year="${year}">
            <span class="archive-date">${year}</span>
            <span class="archive-dot"></span>
            <span class="archive-count" data-total="${list.length}">${list.length} ${label}</span>
          </div>
          ${rows}`;
    })
    .join('');

  return `<section class="surface archive reveal">
      <div class="archive-filter" id="archive-filter">
        <span>Showing posts in <span class="archive-filter-value" id="archive-filter-value"></span></span>
        <a class="btn-tonal" href="/archive/">Clear filter</a>
      </div>
      ${groups}
      <p class="archive-empty" id="archive-empty">Nothing matches that filter yet.</p>
    </section>`;
}

export function notFoundPage(): string {
  return `<section class="surface empty-state reveal">
      <p class="empty-state-code">404</p>
      <p>This page drifted off with the wind.</p>
      <a class="btn-filled" href="/">Back to the blog</a>
    </section>`;
}
