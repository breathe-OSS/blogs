import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { build } from './build.ts';

const OUT = join(import.meta.dirname, '..', 'dist');
const PORT = Number(process.env.PORT ?? 4321);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
};

async function resolve(pathname: string): Promise<string | null> {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const candidates = [join(OUT, safe), join(OUT, safe, 'index.html')];
  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);
      if (info.isFile()) {
        return candidate;
      }
    } catch {
      continue;
    }
  }
  return null;
}

await build({ drafts: true });

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const file = await resolve(url.pathname);
  if (!file) {
    response.writeHead(404, { 'content-type': TYPES['.html'] });
    response.end(await readFile(join(OUT, '404.html')));
    return;
  }
  response.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  response.end(await readFile(file));
}).listen(PORT, () => {
  console.log(`Serving dist/ (drafts included) at http://localhost:${PORT}`);
});
