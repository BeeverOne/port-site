/* Serve the built static site (.vercel/output/static, the files Vercel deploys) for local preview
   and the e2e run. The Vercel adapter does not support `astro preview`, and the pages are static
   anyway; the one on-demand route, /api/contact, is covered by the unit tests (tests/) and by the
   integration run on a Vercel preview deployment, and the e2e suite stubs it per test.
   Usage: node scripts/serve-static.mjs [port]   (default 4322) */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../.vercel/output/static/', import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 4322);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

async function resolve(urlPath) {
  const path = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  for (const candidate of [join(ROOT, path), join(ROOT, path, 'index.html'), join(ROOT, `${path}.html`)]) {
    if (!candidate.startsWith(ROOT)) continue;   // no escaping the output folder
    try { if ((await stat(candidate)).isFile()) return candidate; } catch { /* try the next form */ }
  }
  return null;
}

createServer(async (req, res) => {
  const file = await resolve(req.url || '/');
  if (!file) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(await readFile(file));
}).listen(PORT, () => console.log(`static site on http://localhost:${PORT}/`));
