/* NFT-11 (QS-09): no secret key may appear in client code or in any response the site sends.
   Reads the secret values from .env and searches (1) the built static output, (2) the server function
   bundle (secrets must be read at runtime, not inlined), (3) the live site: every page, the JavaScript
   and CSS they load, and the Keystatic admin page with its bundles. Prints variable names and verdicts
   only, never a value. Usage: node scripts/secret-scan.mjs [https://reverb-one.space] */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SECRETS = ['TURNSTILE_SECRET_KEY', 'RESEND_API_KEY', 'KEYSTATIC_GITHUB_CLIENT_SECRET', 'KEYSTATIC_SECRET', 'PLAYWRIGHT_TESTS_SECRET'];
const LIVE = process.argv[2] || 'https://reverb-one.space';

const env = {};
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const needles = SECRETS.filter((k) => env[k] && env[k].length >= 12).map((k) => [k, env[k]]);
const skipped = SECRETS.filter((k) => !needles.some(([n]) => n === k));

const hits = [];
const scan = (where, text) => { for (const [name, value] of needles) if (text.includes(value)) hits.push(`${name} in ${where}`); };
const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

let files = 0;
for (const root of ['.vercel/output/static', '.vercel/output/functions']) {
  if (!existsSync(root)) { console.log(`missing ${root}: run npm run build first`); process.exit(2); }
  for (const f of walk(root)) { scan(f, readFileSync(f, 'latin1')); files++; }
}

const pages = ['/', '/works', '/works/fuerst-pueckler', '/de/', '/de/works', '/impressum', '/privacy', '/de/impressum', '/de/datenschutz', '/previews/circle-size/', '/keystatic'];
const seen = new Set();
let responses = 0;
const fetchText = async (url) => { const r = await fetch(url, { redirect: 'follow' }); responses++; return { text: await r.text(), headers: [...r.headers].map(([k, v]) => `${k}: ${v}`).join('\n') }; };
for (const path of pages) {
  const { text, headers } = await fetchText(LIVE + path);
  scan(`live ${path}`, text + headers);
  // any quoted /_astro/ script or stylesheet, with or without Vercel's ?dpl= deployment suffix; the
  // Keystatic admin page loads its bundles from an inline module script, not from src attributes
  const queue = [...text.matchAll(/["'](\/_astro\/[^"'?]+\.(?:js|css))(?:\?[^"']*)?["']/g)].map((m) => m[1]);
  while (queue.length) {   // follow chunk imports too ("./x.js" inside a bundle is a sibling in /_astro/)
    const asset = queue.shift();
    if (seen.has(asset)) continue;
    seen.add(asset);
    const a = await fetchText(LIVE + asset);
    scan(`live ${asset}`, a.text + a.headers);
    if (asset.endsWith('.js')) for (const m of a.text.matchAll(/["'`](?:\.\/|\/_astro\/)([A-Za-z0-9_.-]+\.(?:js|css))["'`]/g)) queue.push(`/_astro/${m[1]}`);
  }
}

console.log(`secrets checked: ${needles.map(([n]) => n).join(', ')}${skipped.length ? ` (not set locally, skipped: ${skipped.join(', ')})` : ''}`);
console.log(`searched ${files} build files and ${responses} live responses (${seen.size} bundles)`);
if (hits.length) { console.log(`FAIL: ${hits.length} exposure(s):\n  ${hits.join('\n  ')}`); process.exit(1); }
console.log('PASS: no secret value found');
