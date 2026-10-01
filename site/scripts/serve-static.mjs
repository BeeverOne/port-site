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
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
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

/* Byte ranges, as Vercel serves them: Safari and WebKit only play video from servers that answer
   Range requests with 206 Partial Content, and refuse the whole file sent as a plain 200. */
function byteRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header || '');
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start = m[1] === '' ? size - Number(m[2]) : Number(m[1]);
  let end = m[1] === '' || m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (start < 0) start = 0;
  return start <= end && start < size ? { start, end } : 'unsatisfiable';
}

createServer(async (req, res) => {
  const file = await resolve(req.url || '/');
  if (!file) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
  const data = await readFile(file);
  const type = TYPES[extname(file)] || 'application/octet-stream';
  const range = byteRange(req.headers.range, data.length);
  if (range === 'unsatisfiable') {
    res.writeHead(416, { 'Content-Range': `bytes */${data.length}` }); res.end(); return;
  }
  if (range) {
    res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${range.start}-${range.end}/${data.length}`, 'Content-Length': range.end - range.start + 1 });
    res.end(data.subarray(range.start, range.end + 1));
    return;
  }
  res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': data.length });
  res.end(data);
}).listen(PORT, () => console.log(`static site on http://localhost:${PORT}/`));
