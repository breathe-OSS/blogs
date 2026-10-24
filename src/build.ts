import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { Marked, type Tokens } from 'marked';
import { LINKS, SITE, type Heading, type Post } from './config.ts';
import {
  archivePage,
  emptyList,
  esc,
  isoDate,
  layout,
  listSidebar,
  notFoundPage,
  pagination,
  postCard,
  postPage,
  postPath,
  postSidebar,
  type Taxonomy,
} from './templates.ts';
import { renderChart, type ChartSpec } from './charts.ts';

const ROOT = join(import.meta.dirname, '..');
const POSTS_DIR = join(ROOT, 'posts');
const OUT = join(ROOT, 'dist');

type FrontMatter = Record<string, string | string[]>;

const CHART_PATTERN = /<div class="chart" data-src="([^"]+)"><\/div>/g;

async function embedCharts(
  html: string,
  file: string
): Promise<{ html: string; feedHtml: string }> {
  const specs = new Map<string, ChartSpec>();
  for (const match of html.matchAll(CHART_PATTERN)) {
    const source = match[1];
    const path = join(ROOT, 'public', source);
    if (!existsSync(path)) {
      throw new Error(`${file}: chart data ${source} not found in public/`);
    }
    specs.set(source, JSON.parse(await readFile(path, 'utf8')) as ChartSpec);
  }

  const page = html.replace(CHART_PATTERN, (_, source: string) => {
    return renderChart(specs.get(source) as ChartSpec, source);
  });
  const feed = html.replace(CHART_PATTERN, (_, source: string) => {
    const spec = specs.get(source) as ChartSpec;
    if (!spec.fallback) {
      return '';
    }
    return `<p><img src="${spec.fallback}" alt="${esc(spec.title)}" /></p>`;
  });
  return { html: page, feedHtml: feed };
}

function unquote(value: string): string {
  if (/^(['"]).*\1$/.test(value)) {
    return value.slice(1, -1);
  }
  return value;
}

function parseFrontMatter(source: string): { data: FrontMatter; body: string } {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { data: {}, body: source };
  }

  const data: FrontMatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const index = line.indexOf(':');
    if (index === -1) {
      continue;
    }
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map((item) => unquote(item.trim()))
        .filter(Boolean);
    } else {
      data[key] = unquote(value);
    }
  }
  return { data, body: source.slice(match[0].length) };
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-');
}

function renderMarkdown(body: string): { html: string; headings: Heading[] } {
  const headings: Heading[] = [];
  const used = new Map<string, number>();

  const marked = new Marked({
    gfm: true,
    renderer: {
      heading(
        this: { parser: { parseInline: (tokens: Tokens.Generic[]) => string } },
        token: Tokens.Heading
      ) {
        const inner = this.parser.parseInline(token.tokens);
        const text = stripTags(inner);
        const base = slugify(text) || 'section';
        const seen = used.get(base) ?? 0;
        used.set(base, seen + 1);
        const id = seen === 0 ? base : `${base}-${seen}`;
        if (token.depth === 2 || token.depth === 3) {
          headings.push({ id, depth: token.depth, text });
        }
        return `<h${token.depth} id="${id}"><a class="heading-anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${inner}</h${token.depth}>\n`;
      },
    },
  });

  const html = marked.parse(body, { async: false }) as string;
  return { html, headings };
}

function requireString(data: FrontMatter, key: string, file: string): string {
  const value = data[key];
  if (typeof value !== 'string' || value === '') {
    throw new Error(`${file}: missing "${key}" in front matter`);
  }
  return value;
}

function parseDate(value: string, file: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${file}: "${value}" is not a valid date`);
  }
  return date;
}

async function loadPosts(includeDrafts: boolean): Promise<Post[]> {
  if (!existsSync(POSTS_DIR)) {
    return [];
  }

  const files = (await readdir(POSTS_DIR)).filter((file) => file.endsWith('.md'));
  const posts: Post[] = [];

  for (const file of files) {
    const source = await readFile(join(POSTS_DIR, file), 'utf8');
    const { data, body } = parseFrontMatter(source);
    const draft = data.draft === 'true';
    if (draft && !includeDrafts) {
      continue;
    }

    const rendered = renderMarkdown(body);
    const headings = rendered.headings;
    const { html, feedHtml } = await embedCharts(rendered.html, file);
    const words = body.split(/\s+/).filter((word) => /[a-z0-9]/i.test(word)).length;
    const tags = Array.isArray(data.tags) ? data.tags : [];

    posts.push({
      slug: typeof data.slug === 'string' && data.slug ? data.slug : file.replace(/\.md$/, ''),
      file,
      title: requireString(data, 'title', file),
      description: requireString(data, 'description', file),
      published: parseDate(requireString(data, 'published', file), file),
      updated:
        typeof data.updated === 'string' && data.updated
          ? parseDate(data.updated, file)
          : undefined,
      category:
        typeof data.category === 'string' && data.category ? data.category : 'Uncategorized',
      tags,
      author: typeof data.author === 'string' && data.author ? data.author : SITE.name,
      cover: typeof data.cover === 'string' && data.cover ? data.cover : undefined,
      coverCaption:
        typeof data.coverCaption === 'string' && data.coverCaption ? data.coverCaption : undefined,
      draft,
      html,
      feedHtml,
      headings,
      words,
      minutes: Math.max(1, Math.round(words / SITE.wordsPerMinute)),
    });
  }

  const slugs = new Set<string>();
  for (const post of posts) {
    if (slugs.has(post.slug)) {
      throw new Error(`Duplicate post slug "${post.slug}"`);
    }
    slugs.add(post.slug);
  }

  return posts.sort((a, b) => b.published.getTime() - a.published.getTime());
}

function countBy(values: string[]): Taxonomy[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

async function emit(path: string, contents: string): Promise<void> {
  const target = join(OUT, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents);
}

function rss(posts: Post[]): string {
  const items = posts
    .map((post) => {
      const url = `${SITE.url}${postPath(post)}`;
      const categories = [post.category, ...post.tags]
        .map((name) => `<category>${esc(name)}</category>`)
        .join('');
      return `    <item>
      <title>${esc(post.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${post.published.toUTCString()}</pubDate>
      <dc:creator>${esc(post.author)}</dc:creator>
      <description>${esc(post.description)}</description>
      ${categories}
      <content:encoded><![CDATA[${post.feedHtml.replace(/]]>/g, ']]]]><![CDATA[>')}]]></content:encoded>
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${SITE.title}</title>
    <link>${SITE.url}/</link>
    <description>${esc(SITE.description)}</description>
    <language>en</language>
    <atom:link href="${SITE.url}/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}

function sitemap(posts: Post[], pages: number): string {
  const entries: { loc: string; lastmod?: string }[] = [
    { loc: '/', lastmod: posts[0] ? isoDate(posts[0].updated ?? posts[0].published) : undefined },
    { loc: '/archive/' },
  ];
  for (let page = 2; page <= pages; page++) {
    entries.push({ loc: `/page/${page}/` });
  }
  for (const post of posts) {
    entries.push({ loc: postPath(post), lastmod: isoDate(post.updated ?? post.published) });
  }

  const urls = entries
    .map((entry) => {
      const lastmod = entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : '';
      return `  <url><loc>${SITE.url}${entry.loc}</loc>${lastmod}</url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

function llms(posts: Post[]): string {
  const list = posts
    .map((post) => {
      return `- [${post.title}](${SITE.url}${postPath(post)}) (${isoDate(post.published)}): ${post.description}`;
    })
    .join('\n');

  return `# ${SITE.title}

> ${SITE.description}

This is the official blog of BreatheOSS, the independent, non-profit team behind Breathe. Breathe is a free and open-source air quality network for Jammu & Kashmir and Ladakh, India. For facts about the project itself, see ${LINKS.about}/llms.txt.

## Posts

${list || '- No posts yet.'}

## Links

- [Breathe web app](${LINKS.app})
- [About BreatheOSS](${LINKS.about})
- [GitHub organisation](${LINKS.github})
- [RSS feed](${SITE.url}/rss.xml)
`;
}

function blogJsonLd(posts: Post[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    '@id': `${SITE.url}/#blog`,
    name: SITE.title,
    url: `${SITE.url}/`,
    description: SITE.description,
    publisher: { '@id': `${LINKS.app}/#org` },
    blogPost: posts.map((post) => ({
      '@type': 'BlogPosting',
      headline: post.title,
      url: `${SITE.url}${postPath(post)}`,
      datePublished: isoDate(post.published),
    })),
  };
}

function postJsonLd(post: Post): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    url: `${SITE.url}${postPath(post)}`,
    datePublished: isoDate(post.published),
    dateModified: isoDate(post.updated ?? post.published),
    author: { '@type': 'Person', name: post.author },
    publisher: {
      '@type': 'Organization',
      '@id': `${LINKS.app}/#org`,
      name: SITE.name,
      url: LINKS.app,
    },
    image: post.cover ? `${SITE.url}${post.cover}` : `${SITE.url}/images/social_preview.png`,
    keywords: post.tags.join(', '),
    isPartOf: { '@id': `${SITE.url}/#blog` },
  };
}

async function compileScripts(): Promise<void> {
  const source = join(ROOT, 'assets', 'ts');
  if (!existsSync(source)) {
    return;
  }
  for (const file of await readdir(source)) {
    if (!file.endsWith('.ts')) {
      continue;
    }
    const code = await readFile(join(source, file), 'utf8');
    const js = stripTypeScriptTypes(code, { mode: 'strip' });
    await emit(join('assets', 'js', file.replace(/\.ts$/, '.js')), js);
  }
}

export async function build(options: { drafts?: boolean } = {}): Promise<void> {
  const started = performance.now();
  const version = Date.now().toString(36);
  const posts = await loadPosts(options.drafts ?? false);
  const categories = countBy(posts.map((post) => post.category));
  const tags = countBy(posts.flatMap((post) => post.tags));
  const listAside = listSidebar(categories, tags);

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  await cp(join(ROOT, 'public'), OUT, { recursive: true });
  await cp(join(ROOT, 'assets', 'css'), join(OUT, 'assets', 'css'), { recursive: true });
  await compileScripts();

  const pages = Math.max(1, Math.ceil(posts.length / SITE.pageSize));
  for (let page = 1; page <= pages; page++) {
    const slice = posts.slice((page - 1) * SITE.pageSize, page * SITE.pageSize);
    const cards = slice.map((post, index) => postCard(post, index)).join('');
    const path = page === 1 ? '/' : `/page/${page}/`;
    await emit(
      join(path, 'index.html'),
      layout({
        title: page === 1 ? SITE.title : `Page ${page}`,
        description: SITE.description,
        path,
        content: (cards || emptyList()) + pagination(page, pages),
        sidebar: listAside,
        active: 'home',
        version,
        jsonLd: page === 1 ? blogJsonLd(posts) : undefined,
      })
    );
  }

  for (const [index, post] of posts.entries()) {
    await emit(
      join('posts', post.slug, 'index.html'),
      layout({
        title: post.title,
        description: post.description,
        path: postPath(post),
        content: postPage(post, posts[index - 1], posts[index + 1]),
        sidebar: postSidebar(post),
        active: 'none',
        version,
        image: post.cover,
        type: 'article',
        jsonLd: postJsonLd(post),
        noindex: post.draft,
      })
    );
  }

  await emit(
    join('archive', 'index.html'),
    layout({
      title: 'Archive',
      description: `Every post on the ${SITE.title}, grouped by year.`,
      path: '/archive/',
      content: archivePage(posts),
      sidebar: listAside,
      active: 'archive',
      version,
    })
  );

  await emit(
    '404.html',
    layout({
      title: 'Not found',
      description: 'This page does not exist.',
      path: '/404.html',
      content: notFoundPage(),
      sidebar: listAside,
      active: 'none',
      version,
      noindex: true,
    })
  );

  const published = posts.filter((post) => !post.draft);
  await emit('rss.xml', rss(published));
  await emit('sitemap.xml', sitemap(published, pages));
  await emit('llms.txt', llms(published));

  const elapsed = Math.round(performance.now() - started);
  console.log(`Built ${posts.length} post(s) into dist/ in ${elapsed}ms`);
}

if (import.meta.main) {
  await build({ drafts: process.argv.includes('--drafts') });
}
