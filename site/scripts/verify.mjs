/* Faithfulness check: does the built site still have every hook the prototype's
   behaviour depends on, and does its CSS still carry every prototype rule?
   Run: npm run build && node scripts/verify.mjs */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* The repository root, from this script's own location (site/scripts/), so the check runs on any
   machine and in CI. The reference is a frozen copy of the approved prototype v2 kept in the repo;
   docs/v2/ (git-ignored) stays the owner's working copy. Update both together. */
const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
const proto = readFileSync(`${ROOT}/site/tests/reference/portfolio-prototype-v2.html`, 'utf8');
const js = readFileSync(`${ROOT}/site/src/scripts/site.js`, 'utf8');

/* With the Vercel adapter (ADR-0001) the static pages are written to .vercel/output/static, the
   Build Output API layout Vercel deploys; dist/ only keeps the client build. */
const OUT = `${ROOT}/site/.vercel/output/static`;
const distIndex = `${OUT}/index.html`;
if (!existsSync(distIndex)) {
  console.error('.vercel/output/static/index.html missing — run `npm run build` first.');
  process.exit(1);
}
const built = readFileSync(distIndex, 'utf8');

let fail = 0;
function bad(msg) {
  console.log(`  FAIL  ${msg}`);
  fail++;
}
function ok(msg) {
  console.log(`  ok    ${msg}`);
}
function check(cond, passMsg, failMsg) {
  if (cond) ok(passMsg);
  else bad(failMsg);
}

/* ---------- 1. DOM hooks the behaviour needs ---------- */
console.log('\n[1] DOM hooks required by site.js');
/* These belong to the dev-only prototype control panel, so their absence from a
   production build is correct; site.js reads them with `?.`. */
const DEV_ONLY = new Set(['simFail', 'simSlow', 'replayLoader', 'copyLook', 'saveLook', 'resetLook']);
const ids = new Set();
for (const m of js.matchAll(/\$\('#([\w-]+)'\)/g)) ids.add(m[1]);
for (const m of js.matchAll(/getElementById\('([\w-]+)'\)/g)) ids.add(m[1]);

const missingIds = [...ids].filter((id) => !DEV_ONLY.has(id) && !built.includes(`id="${id}"`));
check(missingIds.length === 0, `all ${ids.size - DEV_ONLY.size} production ids present`, `missing ids: ${missingIds.join(', ')}`);

const leakedDevIds = [...DEV_ONLY].filter((id) => built.includes(`id="${id}"`));
check(leakedDevIds.length === 0, 'dev-only ids absent from prod', `dev-only ids shipped to prod: ${leakedDevIds.join(', ')}`);

for (const c of ['card', 'lang', 'field', 'plus-field']) {
  const present = built.includes(`class="${c}`) || built.includes(` ${c} `) || built.includes(`"${c}"`);
  check(present, `class .${c} present`, `class .${c} missing from built markup`);
}

/* ---------- 2. Data attributes ---------- */
console.log('\n[2] data attributes');
for (const a of ['data-i18n', 'data-lang', 'data-open-contact', 'data-i18n-label', 'data-id']) {
  if (!js.includes(a)) continue;
  /* data-invalid is only ever written at runtime, so it is not expected in the markup */
  check(built.includes(a), `${a} wired`, `${a} used by JS but absent from markup`);
}
check(built.includes('id="projects-data"'), 'projects-data island present', 'projects-data island missing');

/* ---------- 3. Project data island ---------- */
console.log('\n[3] project data island');
const island = built.match(/<script[^>]*id="projects-data"[^>]*>([\s\S]*?)<\/script>/);
if (!island) {
  bad('could not extract island JSON');
} else {
  let data = null;
  try {
    data = JSON.parse(island[1]);
  } catch (e) {
    bad(`island JSON invalid: ${e.message}`);
  }
  if (data) {
    const cardIds = [...built.matchAll(/class="card cb[^"]*"[^>]*data-id="([\w-]+)"/g)].map((m) => m[1]);
    ok(`island parses: ${data.length} projects`);
    check(
      data.length === cardIds.length,
      `card count matches markup (${cardIds.length})`,
      `island has ${data.length} but markup has ${cardIds.length} cards`,
    );
    let fieldsOk = true;
    for (const p of data) {
      for (const lang of ['en', 'de']) {
        const f = p[lang];
        if (!f) {
          bad(`${p.id}: no ${lang} content`);
          fieldsOk = false;
          continue;
        }
        for (const k of ['headline', 'title', 'year', 'tags']) {
          if (f[k] === undefined) {
            bad(`${p.id}.${lang}.${k} missing`);
            fieldsOk = false;
          }
        }
      }
      if (!cardIds.includes(p.id)) bad(`${p.id} in island but no card rendered`);
    }
    if (fieldsOk) ok('every project has headline/title/year/tags in en and de (FR-22)');
  }
}

/* ---------- 4. Stylesheet fidelity ---------- */
console.log('\n[4] stylesheet fidelity');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

/* Canonicalise a selector so the prototype CSS and Astro's minified output compare
   equal. Lightning CSS rewrites all of these without changing meaning:
     ::after -> :after        *:before -> :before      [a="b"] -> [a=b]
     :nth-child(1) -> :first-child                     from -> 0%
     (max-width: 767px) -> (width<=767px)              spaces around > + ~ and after : */
function canon(sel) {
  return sel
    .replace(/\s+/g, ' ')
    .replace(/::(before|after|first-line|first-letter|placeholder|selection)/g, ':$1')
    .replace(/\*\s*(:[\w-])/g, '$1')
    .replace(/\s*([>+~])\s*/g, '$1')
    .replace(/\[([\w-]+)\s*=\s*"([^"]*)"\]/g, '[$1=$2]')
    .replace(/:nth-child\(1\)/g, ':first-child')
    .replace(/max-width:\s*([\d.]+)px/g, 'width<=$1px')
    .replace(/min-width:\s*([\d.]+)px/g, 'width>=$1px')
    .replace(/\(\s+/g, '(')
    .replace(/@media\s*\(/g, '@media(')
    .replace(/\s+\)/g, ')')
    .replace(/,\s*/g, ',')
    .replace(/\bfrom\b/g, '0%')
    .replace(/\bto\b/g, '100%')
    .replace(/:\s+/g, ':')
    .trim()
    .toLowerCase();
}

function selectors(css) {
  const out = new Set();
  for (const m of stripComments(css).matchAll(/([^{}]+)\{/g)) {
    /* a match spans the previous rule's declarations; keep only the selector tail */
    const tail = canon(m[1].split(';').pop());
    if (tail) out.add(tail);
  }
  return out;
}

const protoCss = proto.slice(proto.indexOf('<style>\n') + 8, proto.indexOf('\n</style>'));
const builtCssFiles = [...built.matchAll(/href="(\/_astro\/[^"]+\.css)"/g)].map((m) => m[1]);
if (builtCssFiles.length === 0) bad('no stylesheet linked in built page');

for (const href of builtCssFiles) {
  const p = `${OUT}${href}`;
  if (!existsSync(p)) {
    bad(`stylesheet missing on disk: ${href}`);
    continue;
  }
  const min = readFileSync(p, 'utf8');
  ok(`${href} linked`);

  const want = selectors(protoCss);
  const have = selectors(min);
  const dropped = [...want].filter((s) => !have.has(s));
  check(
    dropped.length === 0,
    `all ${want.size} prototype selectors survive minification`,
    `${dropped.length} prototype selector(s) missing from built CSS:\n          ${dropped.join('\n          ')}`,
  );

  /* Effects a minifier could plausibly rewrite or drop — check values, not just selectors. */
  const critical = [
    ['mask-image plus field', /mask-image:url\("data:image\/svg\+xml/],
    ['edge blur backdrop-filter', /(?:^|[{;])backdrop-filter:blur\(8px\)/],
    ['card thumb conic-gradient', /conic-gradient/],
    ['detail clip-path', /clip-path/],
    ['highlighter gradient', /linear-gradient\(100deg/],
    ['corner-mark hover gradients', /linear-gradient\(var\(--cb\),\s*var\(--cb\)\)/],
    ['loader rise keyframes', /@keyframes rise/],
    ['scan keyframes', /@keyframes scan/],
    ['scan cycle 7s with hover neutralised (CR-12)', /animation:scan 7s/],
    ['tabular numerals on the indicator', /tabular-nums/],
    ['enter arrow nudge keyframes', /@keyframes enterNudge/],
    ['dark-mode media query', /prefers-color-scheme:dark/],
    ['reduced-motion media query', /prefers-reduced-motion:reduce/],
    ['works colour token', /--works:\s*#0f5c55/i],
    ['dark accent token', /--accent:\s*#ff6a2b/i],
    ['font-stretch in use', /font-stretch/],
  ];
  for (const [label, re] of critical) {
    check(re.test(min), label, `${label} — pattern ${re} not in built CSS`);
  }
}
console.log('  note  src/styles/global.css is the v2 prototype <style> block verbatim plus the owner-directed flow-in and hover additions');

/* ---------- 5. Structural parity ---------- */
console.log('\n[5] structural parity with prototype');
const mustHave = [
  ['class="island"', 'content island (v2 architecture)'],
  ['class="scroller"', 'island scroller owns vertical scroll'],
  ['class="runway"', 'runway spacer sizes the transition'],
  ['class="lmark"', 'v-stack loader mark (FR-47)'],
  ['role="slider"', 'draggable indicator slider (FR-05, CR-04)'],
  ['class="hover-title"', 'card hover title above the thumbnail (owner direction)'],
  ['btn-primary', 'primary buttons carry the scan sweep'],
  ['class="plus-field"', 'plus-mark field'],
  ['id="loader"', 'page loader'],
  ['class="site-header"', 'header island'],
  ['class="mark cb"', 'header mark link'],
  ['mark-wordmark', 'desktop wordmark'],
  ['mark-vstack', 'mobile v-stack'],
  ['id="themeBtn"', 'theme toggle (FR-24)'],
  ['id="intro"', 'intro section (FR-01)'],
  ['id="statement"', 'intro statement h1'],
  ['class="edge-blur"', 'bottom-edge blur inside the island'],
  ['id="grain"', 'grain canvas (FR-02)'],
  ['id="works"', 'works section (FR-04)'],
  ['id="track"', 'works track'],
  ['class="indicator', 'horizontal-scroll signal (FR-05)'],
  ['class="works-footer', 'works footer (FR-12)'],
  ['id="wfToggle"', 'mobile footer collapse chevron (owner direction)'],
  ['id="detail"', 'detail view (FR-13)'],
  ['id="contact"', 'contact overlay (FR-26)'],
  ['data-media', 'media items carry their loader (FR-50)'],
  ['href="/impressum" data-legal="impressum"', 'Impressum link (FR-44)'],
  ['href="/privacy" data-legal="privacy"', 'privacy link (FR-45)'],
  ['href="https://github.com/BeeverOne"', 'GitHub profile link (FR-37)'],
  ['href="/fonts/archivo-latin-var.woff2"', 'Archivo webfont self-hosted and preloaded'],
  ['href="/fonts/unbounded-latin-var.woff2"', 'Unbounded webfont self-hosted and preloaded'],
  ['property="og:image"', 'Open Graph image for link previews'],
  ['favicon-dark.svg', 'dark-scheme favicon variant'],
  ['https://reverb-one.space/og.png', 'og:image resolves to an absolute URL on the live domain'],
];
for (const [needle, label] of mustHave) {
  check(built.includes(needle), label, `${label} — "${needle}" not in built page`);
}
/* FR-17, ADR-0008: every interactive preview runs in an iframe sandboxed with allow-scripts only.
   Previews are content, so until a published project has one there is nothing to check. */
const previews = [...built.matchAll(/<iframe\b[^>]*>/g)].map((m) => m[0]);
if (previews.length === 0) console.log('  note  no published project has an interactive preview yet; the FR-17 sandbox check runs once one does');
else {
  const loose = previews.find((f) => !/\bsandbox="allow-scripts"/.test(f));
  check(!loose, `${previews.length} interactive preview(s) sandboxed with allow-scripts only (FR-17, ADR-0008)`, `preview iframe not sandboxed: ${loose}`);
}

/* ---------- 6. Production hygiene ---------- */
console.log('\n[6] production hygiene');
check(!built.includes('class="proto"'), 'prototype control panel excluded from prod', 'prototype control panel leaked into the production build');
check(!built.includes('data-param'), 'transition look controls excluded from prod', 'transition look controls leaked into prod');
check(
  !built.includes('Replay page loader'),
  'prototype control labels absent from prod',
  'prototype control labels leaked into prod',
);
/* Legal pages (FR-44, FR-45, ADR-0012): all four built, each in its own language, each naming the
   operator and the contact email, and each linking to its counterpart in the other language. */
const legalPages = [
  ['impressum/index.html', 'en', '/de/impressum'], ['de/impressum/index.html', 'de', '/impressum'],
  ['privacy/index.html', 'en', '/de/datenschutz'], ['de/datenschutz/index.html', 'de', '/privacy'],
];
for (const [file, lang, other] of legalPages) {
  const path = `${OUT}/${file}`;
  const html = existsSync(path) ? readFileSync(path, 'utf8') : '';
  check(
    html.includes(`<html lang="${lang}"`) && html.includes('Oluwafemi Bamigboye') && html.includes('mailto:thebeeverone@gmail.com')
      && html.includes(`href="${other}"`) && !/fonts\.(googleapis|gstatic)\.com/.test(html),
    `legal page /${file.replace('/index.html', '')} built (${lang}, operator, email, counterpart link)`,
    `legal page /${file.replace('/index.html', '')} missing or incomplete`,
  );
}
/* ADR-0006, ADR-0012: the site exists at /, /works and /works/<id> in English and under /de/ in
   German, each pre-rendered in its language with hreflang alternates, real card links and no
   hash routes left over. */
const projectIds = [...built.matchAll(/class="card[^"]*" href="\/works\/([\w-]+)"/g)].map((m) => m[1]);
check(projectIds.length > 0, `cards link to real project paths (${projectIds.length} projects) (FR-14)`, 'cards do not link to /works/<id>');
const routes = [
  ['index.html', 'en', '/', 'Here’s some of my work'],
  ['works/index.html', 'en', '/works', 'Here’s some of my work'],
  ['de/index.html', 'de', '/', 'Hier sind einige meiner Arbeiten'],
  ['de/works/index.html', 'de', '/works', 'Hier sind einige meiner Arbeiten'],
  ...projectIds.flatMap((id) => [
    [`works/${id}/index.html`, 'en', `/works/${id}`, 'Here’s some of my work'],
    [`de/works/${id}/index.html`, 'de', `/works/${id}`, 'Hier sind einige meiner Arbeiten'],
  ]),
];
const badRoutes = [];
for (const [file, lang, base, trigger] of routes) {
  const path = `${OUT}/${file}`;
  const html = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const de = base === '/' ? '/de/' : `/de${base}`;
  const ok = html.includes(`<html lang="${lang}"`) && html.includes(trigger)
    && html.includes(`hreflang="en" href="https://reverb-one.space${base}"`) && html.includes(`hreflang="de" href="https://reverb-one.space${de}"`)
    && html.includes('hreflang="x-default"') && !html.includes('#/works')
    && (lang === 'de' ? /Software\u00ADentwickler|Software&shy;entwickler/.test(html) : html.includes('software developer'));
  if (!ok) badRoutes.push(file);
}
check(badRoutes.length === 0, `${routes.length} site routes pre-rendered in their language with hreflang pairs (FR-20, ADR-0012)`,
  `routes wrong or missing: ${badRoutes.join(', ')}`);
for (const id of projectIds) {
  const en = readFileSync(`${OUT}/works/${id}/index.html`, 'utf8');
  if (!/<h2 id="detailTitle">[^<]+<\/h2>/.test(en)) { bad(`/works/${id} does not pre-render the project title (FR-15)`); break; }
}

/* FR-45: both privacy pages need a contact-form section (naming Resend) and a Turnstile section. */
for (const file of ['privacy/index.html', 'de/datenschutz/index.html']) {
  const html = readFileSync(`${OUT}/${file}`, 'utf8');
  check(/Plus Five Five, Inc\./.test(html) && /Resend/.test(html) && /Turnstile/.test(html) && /turnstile-privacy-policy/.test(html),
    `/${file.replace('/index.html', '')} covers the contact form (Resend) and Turnstile (FR-45)`,
    `/${file.replace('/index.html', '')} lacks the contact-form or Turnstile section (FR-45)`);
}
/* The dev LOOK panel's saved values (localStorage key "look") must not reach prod: the block is
   behind import.meta.env.DEV, so the bundles must not read or write that key. */
/* keystatic-* bundles are the CMS admin UI (ADR-0003): loaded only at /keystatic by the owner, never by
   a visitor's page, and it links Google's Inter for its own interface, so they are not public code. */
const builtJs = [built, ...readdirSync(`${OUT}/_astro`).filter((f) => f.endsWith('.js') && !f.startsWith('keystatic'))
  .map((f) => readFileSync(`${OUT}/_astro/${f}`, 'utf8'))].join('\n');
/* Fonts are self-hosted: no request may go to Google (it would send visitors' IP addresses there,
   which the privacy policy does not cover), and both @font-face rules must reach the built CSS. */
const builtCss = readdirSync(`${OUT}/_astro`).filter((f) => f.endsWith('.css'))
  .map((f) => readFileSync(`${OUT}/_astro/${f}`, 'utf8')).join('\n');
check(
  !/fonts\.(googleapis|gstatic)\.com/.test(built + builtCss + builtJs),
  'no Google Fonts requests in prod',
  'a fonts.googleapis.com / fonts.gstatic.com reference reached the production build',
);
check(
  /font-family:\s*Archivo[\s\S]*?archivo-latin-var\.woff2/.test(builtCss) && /font-family:\s*Unbounded[\s\S]*?unbounded-latin-var\.woff2/.test(builtCss),
  'self-hosted @font-face rules for Archivo and Unbounded in the built CSS',
  '@font-face rules for the self-hosted fonts missing from the built CSS',
);
check(
  !/["'`]look["'`]/.test(builtJs),
  'saved LOOK overrides compiled out of prod',
  'the dev LOOK storage key reached the production bundle',
);

/* ---------- 7. DOM skeleton parity ---------- */
/* The stylesheet is byte-identical to the prototype, so rendering can only drift if the
   markup does. Compare the body's open-tag sequence (tag#id.class) between the prototype
   and the build. Deliberate, already-verified differences are normalised away first:
     - the works track's cards: the prototype injects them at runtime, Astro renders them
     - the dev-only prototype control panel
     - Astro's own <script>/<link> plumbing and the projects-data island */
console.log('\n[7] DOM skeleton parity with prototype body');

function bodyOf(html) {
  const i = html.indexOf('<body');
  const j = html.lastIndexOf('</body>');
  return i < 0 || j < 0 ? html : html.slice(i, j);
}
function skeleton(html) {
  let s = bodyOf(html);
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<script[\s\S]*?<\/script>/g, '');
  /* the hidden v-stack <symbol> the media loaders reuse (FR-50) is not in the prototype */
  s = s.replace(/<svg class="sym"[\s\S]*?<\/svg>/g, '');
  /* the detail view's content: the prototype's four placeholder blocks, the build's CMS blocks (FR-17) */
  s = s.replace(/(<h2 id="detailTitle"[^>]*>[\s\S]*?<\/h2>)[\s\S]*?(<\/div>\s*<\/article>)/, '$1$2');
  /* the detail view's sticky bar, head wrapper and meta spans are owner-directed additions (CR-29) */
  s = s.replace(/<div class="detail-bar">/, '');
  s = s.replace(/<span class="detail-section"[^>]*><\/span>/, '');
  s = s.replace(/<span class="detail-progress"[^>]*><i[^>]*><\/i><\/span>/, '');
  s = s.replace(/<header class="detail-head">/, '');
  s = s.replace(/<span class="m-(?:title|year)">[^<]*<\/span>/g, '');
  s = s.replace(/<svg[\s\S]*?<\/svg>/g, '<svg>'); /* svg innards come from the extracted marks */
  s = s.replace(/<details class="proto">[\s\S]*?<\/details>/g, '');
  /* the statement is pre-rendered now (ADR-0012); the prototype fills it at runtime */
  s = s.replace(/(<h1 id="statement"[^>]*>)[\s\S]*?(<\/h1>)/, '$1$2');
  /* the island field is the only plus-mark field now; the prototype still carries two */
  s = s.replace(/<div class="plus-field"[^>]*>\s*<\/div>/g, '');
  /* the hover title is an owner-directed addition, not in the prototype */
  s = s.replace(/<span class="hover-title"[^>]*>[\s\S]*?<\/span>/g, '');
  /* the mobile footer wrappers and chevron are owner-directed additions too */
  s = s.replace(/<div class="wf-row">/g, '');
  s = s.replace(/<button class="wf-toggle[^>]*>[\s\S]*?<\/button>/g, '');
  s = s.replace(/<div class="wf-more"[^>]*>/g, '');
  s = s.replace(/<div class="wf-more-inner">/g, '');
  s = s.replace(/<div class="track"[^>]*>[\s\S]*?<\/div>\s*<div class="indicator/g, '<div class="track" id="track"><div class="indicator');
  const tags = [];
  for (const m of s.matchAll(/<([a-zA-Z][\w-]*)([^>]*)>/g)) {
    const tag = m[1].toLowerCase();
    const attrs = m[2];
    if (tag === 'link' || tag === 'meta') continue;
    const id = (attrs.match(/\bid="([^"]*)"/) || [])[1];
    const cls = (attrs.match(/\bclass="([^"]*)"/) || [])[1];
    let t = `<${tag}`;
    if (id) t += `#${id}`;
    if (cls) t += `.${cls.trim().split(/\s+/).sort().join('.')}`;
    tags.push(t + '>');
  }
  return tags;
}

const protoSkel = skeleton(proto);
const builtSkel = skeleton(built);
if (protoSkel.length === builtSkel.length && protoSkel.every((t, i) => t === builtSkel[i])) {
  ok(`body skeleton identical (${builtSkel.length} elements)`);
} else {
  bad(`body skeleton differs: prototype ${protoSkel.length} elements vs build ${builtSkel.length}`);
  const n = Math.max(protoSkel.length, builtSkel.length);
  let shown = 0;
  for (let i = 0; i < n && shown < 12; i++) {
    if (protoSkel[i] !== builtSkel[i]) {
      console.log(`          [${i}] prototype: ${protoSkel[i] ?? '(absent)'}`);
      console.log(`          [${i}] build:     ${builtSkel[i] ?? '(absent)'}`);
      shown++;
    }
  }
}

/* Class-name multiset: catches a renamed or dropped hook the sequence check could mask. */
/* Known, deliberate differences: the track's cards (Astro renders them, the prototype
   injects them at runtime) and the dev-only prototype control panel (checked in [6]). */
const EXPECTED_CLASS_DIFF = ['card', 'cb', 'thumb', 'meta', 'tags', 'year', 't', 'proto', 'stagger', 'hover-title', 'plus-field', 'wf-row', 'wf-toggle', 'wf-more', 'wf-more-inner', 'name', 'hl', 'sym', 'media-box', 'media-loader', 'mbase', 'mfill', 'media-failed', 'media-retry', 'detail-blocks', 'block-text', 'block-media', 'block', 'media', 'demo', 'swatch', 'block-heading', 'sec', 'sec-num', 'sec-title', 'sub', 'sub-key', 'lede', 'block-facts', 'block-list', 'ref', 'detail-bar', 'detail-section', 'detail-progress', 'detail-head', 'm-title', 'm-year', 'detail-body', 'detail-toc', 'detail-toc-label'];   // media-*, block-*: CMS blocks and loaders (FR-17, FR-50); block, media, demo, swatch: the prototype's placeholders they replace   // sec*, sub*, lede, ref, detail-*, m-*: the detail reading layout (CR-29)   // name, hl: the pre-rendered statement spans (ADR-0012)
function classBag(html) {
  const bag = new Map();
  for (const m of bodyOf(html).matchAll(/\bclass="([^"]*)"/g)) {
    for (const c of m[1].trim().split(/\s+/)) if (c) bag.set(c, (bag.get(c) || 0) + 1);
  }
  return bag;
}
const pb = classBag(proto);
const bb = classBag(built);
const classDrift = [];
for (const [c, n] of pb) {
  const m = bb.get(c) || 0;
  if (m !== n && !EXPECTED_CLASS_DIFF.includes(c)) classDrift.push(`${c}: proto ${n} vs build ${m}`);
}
for (const [c] of bb) {
  if (!pb.has(c) && !EXPECTED_CLASS_DIFF.includes(c)) classDrift.push(`${c}: only in build`);
}
check(classDrift.length === 0, 'class-name inventory matches', `class drift:\n          ${classDrift.join('\n          ')}`);

if (fail === 0) console.log('\nPASS — built site is faithful to the prototype');
else console.log(`\nFAIL — ${fail} problem(s)`);
process.exit(fail === 0 ? 0 : 1);
