# Breathe Blog

The BreatheOSS blog, live at [blogs.breatheoss.app](https://blogs.breatheoss.app).

The UI follows the Material 3 theme of [breatheoss.app](https://breatheoss.app), with a layout inspired by the Fuwari theme.

## How it works

There is no framework. `src/build.ts` reads every Markdown file in `posts/`, renders it with [marked](https://marked.js.org) and writes plain static HTML to `dist/`. It also generates `rss.xml`, `sitemap.xml` and `llms.txt`, so those never go stale.

Node 24 runs the TypeScript directly, so there is no compile step.

## Writing a post

Create `posts/<slug>.md`. The file name becomes the URL (`/posts/<slug>/`).

```md
---
title: Post title
description: One or two sentences for the card, search engines and RSS.
published: 2026-10-25
updated: 2026-10-30
category: Sensors
tags: [airgradient, hardware]
author: sidharthify
cover: /images/posts/my-post/cover.webp
coverCaption: What the cover shows. Image: who made it.
draft: false
---

Write the post here.
```

Only `title`, `description` and `published` are required. Put images in `public/images/`. For an image that should change with the theme, add both versions and tag them:

```html
<img class="only-dark" src="/images/posts/my-post/chart-dark.png" alt="What the chart shows" />
<img class="only-light" src="/images/posts/my-post/chart-light.png" alt="What the chart shows" />
```

For a photo with a caption and credit:

```html
<figure>
  <img src="/images/posts/my-post/photo.jpg" alt="What the photo shows" />
  <figcaption>
    What is happening. Photo by Name for <a href="https://example.com">Source</a>.
  </figcaption>
</figure>
```

For an interactive chart, put its data in `public/data/` as JSON and add one line where it should appear:

```html
<div class="chart" data-src="/data/my-post/chart.json"></div>
```

The build turns it into an SVG chart that follows the site theme, with a hover tooltip, a data table and a download link. The JSON describes the chart:

```json
{
  "kind": "line",
  "layout": "single",
  "title": "Daily average PM2.5",
  "subtitle": "One line about what the chart shows.",
  "unit": "µg/m³",
  "yLabel": "PM2.5 (µg/m³)",
  "categories": true,
  "legend": [{ "name": "Jammu", "color": "jammu", "style": "solid" }],
  "x": { "labels": ["10 Sep 2026", "11 Sep 2026"], "ticks": [[0, "10 Sep"]] },
  "panels": [
    {
      "yMax": 125,
      "series": [{ "name": "Jammu", "color": "jammu", "style": "solid", "values": [51.2, 62.1] }],
      "marks": [{ "series": 0, "index": 1, "label": "Jammu 62" }]
    }
  ],
  "fallback": "/images/posts/my-post/chart.png"
}
```

`kind` is `line` or `bar`. `layout` is `single`, `rows` or `columns` when there is more than one panel. `color` is `jammu`, `srinagar` or `muted`, and `style` is `solid`, `dashed` or `faint`. Bar panels can add `valueLabels` as `[series, index]` pairs. The `fallback` image is used in the RSS feed, where charts can't run.

Posts with `draft: true` show up in `npm run dev` but are left out of `npm run build`.

## Commands

```sh
npm install
npm run dev     # builds with drafts and serves on http://localhost:4321, rebuilds on save
npm run build   # production build into dist/
```

## Deploying

Build command `npm run build`, output directory `dist`, Node 24.2 or newer.

## License

MIT
