import { T } from '../i18n/ui.js';
import { PUBLIC_TURNSTILE_SITE_KEY } from 'astro:env/client';

/* The intro copy is CMS content (Keystatic, src/content/intro.yaml): the page carries both languages
   as JSON, and they join the interface strings so applyLang() and renderStatement() can switch it. */
try {
  const intro = JSON.parse(document.getElementById('intro-data').textContent);
  const KEYS = ['about', 'statement', 'p2', 'p3', 'p4', 'trigger'];   // copy known keys only, never the whole object
  for (const l of ['en', 'de']) for (const k of KEYS) if (intro?.[l]?.[k] != null) T[l][k] = intro[l][k];
} catch (e) { console.error('intro data island unreadable', e); }

(() => {
'use strict';

/* ---------- Settings ---------- */
const LOADER_MS = 1000;        // FR-48: measured average time to "intro ready", at least 1000 and at most 2000 (M-02 measured 162)
/* Transition look parameters. Sizes and density are viewport-relative, so a value tuned on one
   display behaves the same on any other; the px clamps are only extreme safety rails.
   The dev-only control panel writes these live (ProtoControls.astro). */
const LOOK = {
  fade: 0.45,        // share of the transition taken by the background cross-fade, centred on its middle
  stream: 1.45,      // height of the circle stream, in island heights
  speed: 2.4,        // auto-scroll travel of the transition: R = (S+H)/speed, in island heights
  scale: 0.8,        // radius multiplier for every circle
  density: 20,       // circle columns across the island width
  falloff: 1.35,     // exponent of the size envelope along the stream
  falloffWidth: 0.7, // width of the envelope's large-middle band (0.3-1)
  jitter: 1,         // position and radius randomness (0 = even grid, 1 = prototype spread)
  rmin: 0.5,         // skip circles below this radius, px
  rmax: 0,           // absolute radius cap, px; 0 keeps the nearest-neighbour cap only
  lead: 0.22,        // how far before the transition ends the flow-in starts, in progress units
  triggerOffset: 252 // px below the island top at which the trigger line starts the transition
};
const BAKED_LOOK = Object.assign({}, LOOK);   // reset target; session overrides load below
const SETTLE_MS = 250;         // owner direction: brief pause at a section boundary before the next input phase takes over
const STAGGER_MS = 50;         // flow-in: per-item delay once the transition ends (CR-20)
const FLOW_MS = 600;           // flow-in: per-item duration
const TRANSITION_MS = 1800;    // the transition is its own animation: duration at full travel
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

/* ---------- Content (placeholder until the CMS supplies it) ---------- */
/* Read directly, not via $: the $ helper is declared further down this file.
   The island is generated at build time by src/pages/index.astro; if it is ever
   missing or malformed, degrade to an empty track rather than white-screen. */
let RAW_PROJECTS = [];
try {
  RAW_PROJECTS = JSON.parse(document.getElementById('projects-data').textContent);
} catch (err) {
  console.error('project data island unreadable', err);
}
const PROJECTS = [];
/* Resolve each project's fields into the active language (FR-10, FR-22). */
function syncProjects() {
  PROJECTS.length = 0;
  RAW_PROJECTS.forEach((p) => PROJECTS.push({ id: p.id, ...p[lang] }));
}


const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage can be blocked */ } }
};
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const scroller = $('#scroller'), track = $('#track'), works = $('#works');

/* ---------- Language and addresses (FR-20, FR-21, FR-22; ADR-0006, ADR-0012) ----------
   The URL selects the language: /de/... is German, every other path English. On an English URL the
   site switches to German in place, and moves the address to the /de/ path, when the saved choice
   is German, or when nothing is saved and the browser prefers German. */
const stripLang = (path) => path.replace(/^\/de(?=\/|$)/, '') || '/';
const langPath = (path, l) => { const base = stripLang(path); return l === 'de' ? (base === '/' ? '/de/' : '/de' + base) : base; };
const prefix = () => (lang === 'de' ? '/de' : '');
const homePath = () => (lang === 'de' ? '/de/' : '/');
const urlLang = () => (/^\/de(\/|$)/.test(location.pathname) ? 'de' : 'en');
const prefs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || 'en'];
const savedLang = store.get('lang');
let lang = urlLang() === 'de' || savedLang === 'de' || (!savedLang && String(prefs[0]).toLowerCase().startsWith('de')) ? 'de' : 'en';
{
  // a #/works link shared before the real paths existed becomes its path, in the chosen language
  const legacy = location.hash.match(/^#\/works(?:\/([\w-]+))?/);
  if (legacy) history.replaceState(null, '', prefix() + '/works' + (legacy[1] ? '/' + legacy[1] : '') + location.search);
  else if (lang !== urlLang()) history.replaceState(null, '', langPath(location.pathname, lang) + location.search + location.hash);
}
function renderStatement() {
  const h1 = $('#statement'); h1.textContent = '';
  T[lang].statement.forEach((part) => {
    if (part.t != null) { h1.append(part.t); return; }
    const s = document.createElement('span');
    if (part.name) { s.className = 'name'; s.textContent = part.name; }
    else { s.className = 'hl'; s.textContent = part.hl; s.style.setProperty('--hl-delay', part.delay + 'ms'); s.style.setProperty('--hl-dur', part.dur + 'ms'); }
    h1.append(s);
  });
}
function applyLang() {
  localizeCards();
  if (openId) showBlocks(openId);   // an open detail view switches to the blocks in the new language
  document.documentElement.lang = lang;
  renderStatement();
  $$('[data-i18n]').forEach((el) => { const v = T[lang][el.dataset.i18n]; if (v != null) el.textContent = v; });
  $$('[data-i18n-label]').forEach((el) => el.setAttribute('aria-label', T[lang][el.dataset.i18nLabel]));
  $$('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  track.setAttribute('aria-label', T[lang].projects);
  $$('[data-legal]').forEach((a) => { a.href = LEGAL[a.dataset.legal][lang]; });   // FR-44, FR-45: the page in the active language
  updateThemeLabel();
  requestAnimationFrame(layout);   // text length changes the intro height
}
const LEGAL = {   // ADR-0012: English at the root, German under /de/
  impressum: { en: '/impressum', de: '/de/impressum' },
  privacy: { en: '/privacy', de: '/de/datenschutz' },
};
$$('.lang button').forEach((b) => b.addEventListener('click', () => {
  lang = b.dataset.lang; store.set('lang', lang); applyLang();
  // FR-21: the same page in the other language, without loading a new document
  history.replaceState(history.state, '', langPath(location.pathname, lang) + location.search);
}));

/* ---------- Theme (FR-24, FR-25) ---------- */
const sysDark = window.matchMedia('(prefers-color-scheme: dark)');
const savedTheme = store.get('theme');
if (savedTheme === 'light' || savedTheme === 'dark') document.documentElement.dataset.theme = savedTheme;
const isDark = () => document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : sysDark.matches;
function updateThemeLabel() { $('#themeBtn').setAttribute('aria-label', isDark() ? T[lang].toLight : T[lang].toDark); }
function readColours() { const cs = getComputedStyle(document.documentElement); colA = rgb(cs.getPropertyValue('--bg')); colB = rgb(cs.getPropertyValue('--works')); }
$('#themeBtn').addEventListener('click', () => {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next; store.set('theme', next); updateThemeLabel(); readColours(); render();
});
sysDark.addEventListener('change', () => { updateThemeLabel(); readColours(); render(); });

/* ---------- Page loader (FR-47 to FR-49, FR-52) ---------- */
function runLoader() {
  const el = $('#loader');
  el.classList.remove('done', 'loop'); el.classList.add('run'); document.body.classList.remove('ready');
  el.style.setProperty('--fill-ms', LOADER_MS + 'ms');
  const fill = el.querySelector('.fillmark'); fill.style.animation = 'none'; fill.getBoundingClientRect(); fill.style.animation = '';   /* forced reflow restarts the fill */
  let filled = false, ready = false;
  const finish = () => { el.classList.add('done'); document.body.classList.add('ready'); };
  const slow = $('#simSlow')?.checked ? 3500 : 0;
  Promise.all([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise((r) => setTimeout(r, slow))])
    .then(() => { ready = true; showLoadTime(); if (filled) finish(); });
  setTimeout(() => { filled = true; if (ready) finish(); else { el.classList.remove('run'); el.classList.add('loop'); } }, reduce.matches ? 0 : LOADER_MS);
}
$('#replayLoader')?.addEventListener('click', runLoader);
/* FR-48 measurement aid (measurements.md M-02): with ?loadtime in the address, the page shows its
   time to "intro ready" (milliseconds since navigation start, the moment the loader may end) in a small
   badge, so it can be read off on a phone without developer tools. Nothing shows without the
   parameter. Once per page load: a replayed loader does not re-measure. */
let loadTimeShown = false;
function showLoadTime() {
  if (loadTimeShown || !new URLSearchParams(location.search).has('loadtime')) return;
  loadTimeShown = true;
  const ms = Math.round(performance.now());
  const badge = document.createElement('output');
  badge.id = 'loadtime';
  badge.textContent = 'intro ready: ' + ms + ' ms';
  badge.style.cssText = 'position:fixed;z-index:200;left:8px;bottom:8px;padding:6px 10px;border-radius:8px;background:#000;color:#fff;font:600 14px/1 system-ui,sans-serif';
  document.body.append(badge);
}

/* Dev-only transition look controls: write LOOK live and re-measure or re-draw. The whole block
   is compiled out of production builds, so a saved look can never override the baked LOOK there. */
if (import.meta.env.DEV) {
  const lookInputs = $$('.proto [data-param]');
  const lookOut = (inp) => { const o = document.querySelector('output[data-out="' + inp.dataset.param + '"]'); if (o) o.textContent = inp.value; };
  lookInputs.forEach((inp) => {
    inp.value = String(LOOK[inp.dataset.param]);
    lookOut(inp);
    inp.addEventListener('input', () => {
      LOOK[inp.dataset.param] = parseFloat(inp.value);
      lookOut(inp);
      if (['density', 'jitter', 'stream', 'speed', 'triggerOffset'].includes(inp.dataset.param)) layout(); else render();
    });
  });
  /* Saved values (localStorage, so they persist across dev sessions) reload with the panel;
     Copy emits a paste-ready LOOK literal. */
  let savedLook = null;
  try { savedLook = JSON.parse(store.get('look') || 'null'); } catch { savedLook = null; }
  if (savedLook && typeof savedLook === 'object') {
    for (const k of Object.keys(LOOK)) {
      if (typeof savedLook[k] === 'number' && isFinite(savedLook[k])) LOOK[k] = savedLook[k];
    }
    lookInputs.forEach((inp) => { inp.value = String(LOOK[inp.dataset.param]); lookOut(inp); });
    /* no layout() here: the start block runs it once every declaration exists */
  }
  $('#copyLook')?.addEventListener('click', () => {
    const text = 'const LOOK = {\n' + Object.entries(LOOK).map(([k, v]) => '  ' + k + ': ' + v + ',').join('\n') + '\n};';
    if (navigator.clipboard) navigator.clipboard.writeText(text);
    console.log(text);
  });
  $('#saveLook')?.addEventListener('click', () => store.set('look', JSON.stringify(LOOK)));
  $('#resetLook')?.addEventListener('click', () => {
    Object.assign(LOOK, BAKED_LOOK);
    store.set('look', '{}');
    lookInputs.forEach((inp) => { inp.value = String(LOOK[inp.dataset.param]); lookOut(inp); });
    layout();
  });
}

/* ---------- Works track ---------- */
function localizeCards() {
  syncProjects();
  PROJECTS.forEach((p) => {
    const a = track.querySelector('.card[data-id="' + p.id + '"]');
    if (!a) return;
    a.href = prefix() + '/works/' + p.id;   // FR-14: the project's own URL in the active language
    a.querySelector('h3').textContent = p.headline;
    a.querySelector('.hover-title').textContent = p.headline;
    const thumb = a.querySelector('.thumb img');
    if (thumb) thumb.alt = p.thumbAlt || '';
    a.querySelector('.t').textContent = p.title;
    a.querySelector('.year').textContent = p.year;
    const tags = a.querySelector('.tags');
    tags.textContent = '';
    p.tags.forEach((t) => { const s = document.createElement('span'); s.textContent = t; tags.append(s); });
  });
}
const cards = () => $$('.card', track);
const trackMax = () => Math.max(0, track.scrollWidth - track.clientWidth);
const cardStep = () => { const c = cards(); return c.length > 1 ? c[1].offsetLeft - c[0].offsetLeft : track.clientWidth; };
function currentIndex() {
  if (track.scrollLeft >= trackMax() - 2) return PROJECTS.length - 1;
  return clamp(Math.round(track.scrollLeft / cardStep()), 0, PROJECTS.length - 1);
}
function updateIndicator() {
  const i = currentIndex(), n = PROJECTS.length, max = Math.max(1, trackMax());
  $('#pos').textContent = (i + 1) + ' / ' + n;
  $('#barFill').style.width = (100 / n) + '%';
  $('#barFill').style.left = (track.scrollLeft / max * (100 - 100 / n)) + '%';
  $('#bar').setAttribute('aria-valuenow', String(i + 1));
  $('#bar').setAttribute('aria-valuetext', T[lang].sliderValue.replace('{a}', String(i + 1)).replace('{b}', String(n)));
}
track.addEventListener('scroll', () => {
  const first = track.scrollLeft <= 2;
  if (first && !wasFirstCard) settleUntil = performance.now() + SETTLE_MS;   // pause before the return scroll takes over
  wasFirstCard = first;
  updateIndicator();
}, { passive: true });

let target = null, raf = 0;
function jack(delta) {                                   // FR-06: vertical input moves the track sideways
  if (target === null) target = track.scrollLeft;
  target = clamp(target + delta, 0, trackMax());
  if (!raf) raf = requestAnimationFrame(tick);
}
function tick() {
  const cur = track.scrollLeft, next = cur + (target - cur) * 0.2;
  track.scrollLeft = Math.abs(target - next) < 2 ? target : next;
  const moved = Math.abs(track.scrollLeft - cur) >= 0.5;
  if (moved && Math.abs(track.scrollLeft - target) > 0.5) raf = requestAnimationFrame(tick);
  else { raf = 0; target = null; }
}
function goToCard(i, focus) {
  const c = cards()[i]; if (!c) return;
  track.scrollTo({ left: c.offsetLeft - cards()[0].offsetLeft, behavior: reduce.matches ? 'auto' : 'smooth' });
  if (focus) c.focus({ preventScroll: true });
}

/* draggable scroll bar (pointer and touch) */
const bar = $('#bar');
let barPointer = null;   // multi-touch guard: one finger drives the drag
function barTo(clientX) {
  const r = bar.getBoundingClientRect(), n = PROJECTS.length, w = r.width * (1 / n);
  const ratio = clamp((clientX - r.left - w / 2) / (r.width - w));
  target = null; track.scrollLeft = ratio * trackMax();
}
bar.addEventListener('pointerdown', (e) => { if (barPointer !== null) return; barPointer = e.pointerId; bar.setPointerCapture(e.pointerId); barTo(e.clientX); });
bar.addEventListener('pointermove', (e) => { if (barPointer === e.pointerId) barTo(e.clientX); });
bar.addEventListener('pointerup', (e) => { if (barPointer === e.pointerId) barPointer = null; });
bar.addEventListener('pointercancel', (e) => { if (barPointer === e.pointerId) barPointer = null; });
bar.addEventListener('keydown', (e) => {
  const i = currentIndex();
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); goToCard(Math.min(i + 1, PROJECTS.length - 1)); }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); goToCard(Math.max(i - 1, 0)); }
  if (e.key === 'Home') { e.preventDefault(); e.stopPropagation(); goToCard(0); }
  if (e.key === 'End') { e.preventDefault(); e.stopPropagation(); goToCard(PROJECTS.length - 1); }
});

/* ---------- Scroll-driven grain transition (FR-02, FR-03, FR-18) ----------
   The trigger line fades out upwards when it reaches the top of the island. At the same moment, a stream of circles
   moves in from the bottom. The circles move with the scroll. Along the stream, the circle size goes small -> large -> small,
   so the largest circles are in the middle of the screen at the middle of the transition. The background cross-fades
   (circles use the inverted colours). Then the works section scrolls in from the bottom with a staggered entry.
   Scrolling up plays everything in reverse. */
const canvas = $('#grain'), ctx = canvas.getContext('2d');
let W = 0, H = 0, S = 0, R = 1, runwayStart = 0, pts = [], colA = [0, 0, 0], colB = [0, 0, 0];
function mulberry(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function rgb(h) { h = h.trim(); if (h.startsWith('#')) return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const m = h.match(/\d+(\.\d+)?/g); return m ? m.slice(0, 3).map(Number) : [0, 0, 0]; }
const mix = (a, b, f) => 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * f)).join(',') + ')';
const offsetIn = (el) => el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;

function layout() {
  W = scroller.clientWidth; H = scroller.clientHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  S = H * LOOK.stream; R = (S + H) / LOOK.speed;
  works.style.setProperty('--lift', Math.round(H * 0.115) + 'px');   // flow-in lift scales with the island
  const outro = $('#outro');
  const prevTransform = outro.style.transform; outro.style.transform = 'none';
  runwayStart = offsetIn(outro) - LOOK.triggerOffset;
  outro.style.transform = prevTransform;
  const introEnd = offsetIn($('#runway'));
  // the works section fills the island exactly when the circle stream ends; the flow-in
  // then plays on its own clock, so no extra scroll is needed to bring it into view
  $('#runway').style.height = Math.max(0, Math.round(runwayStart + R - introEnd)) + 'px';
  // circle stream: jittered grid, radius capped by the nearest neighbour so circles never overlap
  const cell = clamp(W / LOOK.density, 24, 220), rnd = mulberry(7);
  const lo = 0.5 - 0.38 * LOOK.jitter, spread = 0.76 * LOOK.jitter;
  pts = [];
  for (let gy = 0; gy < S / cell; gy++) for (let gx = -1; gx < W / cell + 1; gx++) {
    pts.push({ x: gx * cell + cell * (lo + spread * rnd()) + (gy % 2 ? cell / 2 : 0), sy: gy * cell + cell * (lo + spread * rnd()), k: (1 - 0.4 * LOOK.jitter) + 0.4 * LOOK.jitter * rnd() });
  }
  for (const p of pts) {
    let m = Infinity;
    for (const q of pts) if (q !== p) { const d = (p.x - q.x) ** 2 + (p.sy - q.sy) ** 2; if (d < m) m = d; }
    p.maxR = Math.max(0, Math.sqrt(m) / 2 - cell * 0.06);
  }
  readColours();
  // flow-in stagger delays per item; the scroll lock lasts until the last item settles
  const flowEls = $$('.stagger', works);
  flowEls.forEach((el, i) => el.style.setProperty('--fd', (i * STAGGER_MS) + 'ms'));
  flowLockMs = reduce.matches ? 0 : Math.max(0, flowEls.length - 1) * STAGGER_MS + FLOW_MS;
  render();
}

let lastWorksHash = null;
let routed = false;   // render() leaves the address alone until the start-up route() has placed the view
function render() {
  let p;
  if (anim) {
    // the transition is its own animation: progress runs on the clock and drives the view
    const t = clamp((performance.now() - anim.start) / anim.dur);
    // cubic Hermite from the incoming speed (anim.m, in units of the whole travel) to rest: with
    // m = 0 this is the plain S-curve; after a touch flick the view keeps the finger's speed
    // instead of stalling at the trigger line and starting again from zero (mobile glitch)
    const e = anim.m * (t * t * t - 2 * t * t + t) + (3 * t * t - 2 * t * t * t);
    p = anim.from + (anim.to - anim.from) * e;
    scroller.scrollTop = runwayStart + p * R;
    if (t >= 1) {
      anim = null;
      scroller.style.overflowY = '';   // native scrolling back (see startAnim)
      if (pendingHome) { pendingHome = false; scroller.scrollTo({ top: 0, behavior: reduce.matches ? 'auto' : 'smooth' }); }
    }
  } else {
    p = clamp((scroller.scrollTop - runwayStart) / R);
  }
  const st = scroller.scrollTop;
  let f = clamp((p - (0.5 - LOOK.fade / 2)) / LOOK.fade); f = f * f * (3 - 2 * f);
  const mw = f >= 0.5;
  if (mw !== wasModeWorks) {   // only on a flip: re-setting inert every frame re-runs style work
    wasModeWorks = mw;
    document.body.classList.toggle('mode-works', mw);
    // CR-15: the off-stage half is inert, so keyboard and screen-reader focus stay on what shows.
    // Focus inside the half that goes inert would fall back to <body> (the next Tab then starts at
    // the top of the page), so it moves across: to the current card going forward, back to the
    // enter arrow going in reverse. Only when focus was in that half, so pointer users are unaffected.
    const intro = $('#intro'), active = document.activeElement;
    const handOff = (mw ? intro : works).contains(active);
    intro.inert = mw;
    works.inert = !mw;
    if (handOff) (mw ? cards()[currentIndex()] || $('#worksTitle') : $('#enterWorks')).focus({ preventScroll: true });
  }

  // the flow-in starts just before the transition ends and locks scrolling until it settles;
  // scrolling back below the trigger plays the softer exit and unlocks
  const arrived = p >= 1 - LOOK.lead;
  if (arrived !== wasArrived) {
    wasArrived = arrived;
    works.classList.toggle('flow', arrived);
    flowSettleAt = arrived ? performance.now() + flowLockMs : 0;
    lockUntil = arrived ? flowSettleAt : 0;
  }

  // trigger line fades out upwards
  const u = clamp((st - runwayStart) / (H * 0.22));
  const outro = $('#outro');
  outro.style.opacity = String(1 - u);
  outro.style.transform = reduce.matches ? 'none' : 'translateY(' + (-u * 48) + 'px)';

  // canvas: background cross-fade + circle stream
  if (p <= 0) { canvas.style.visibility = 'hidden'; }
  else {
    canvas.style.visibility = 'visible';
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = clamp(p / 0.3); ctx.fillStyle = mix(colA, colB, f); ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    if (!reduce.matches && p < 1) {
      ctx.fillStyle = mix(colB, colA, f); ctx.beginPath();
      const shift = H - p * (S + H);
      for (const c of pts) {
        const y = c.sy + shift;
        const x = clamp(0.5 + (clamp(c.sy / S) - 0.5) / LOOK.falloffWidth);
        // floor keeps the stream's smallest circles on screen from the very start
        const env = Math.max(0.04, Math.pow(Math.sin(Math.PI * x), LOOK.falloff));   // small -> large -> small along the stream
        const r = Math.min(c.maxR * c.k * LOOK.scale * env, LOOK.rmax || Infinity);
        if (r < LOOK.rmin || y < -r || y > H + r) continue;
        ctx.moveTo(c.x + r, y); ctx.arc(c.x, y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }

  $('#edgeBlur').style.opacity = String(1 - clamp(p * 3));

  // works overview URL while the works section fills the island (FR-11, FR-16)
  const atWorks = atBottom();
  if (routed && atWorks !== lastWorksHash && !$('#detail').classList.contains('open')) {
    lastWorksHash = atWorks;
    const onWorksPath = /^\/works(\/|$)/.test(stripLang(location.pathname));
    if (atWorks && !onWorksPath) history.replaceState(null, '', prefix() + '/works' + location.search);
    if (!atWorks && onWorksPath) history.replaceState(null, '', homePath() + location.search);
  }
}
let rq = 0, settleUntil = 0, wasBottom = false, wasFirstCard = true;
let flowLockMs = 0, lockUntil = 0, wasArrived = false, flowSettleAt = 0, wasModeWorks = null;
let anim = null, wasSt = -1, wasT = 0, scrollVel = 0, pendingHome = false, animRaf = 0;
function animTick() {
  render();
  animRaf = anim ? requestAnimationFrame(animTick) : 0;
}
/* vel: the scroll speed that started the transition, in px per ms in the direction of travel (0 for
   wheel ticks, keys and buttons). */
function startAnim(to, vel = 0) {
  const p0 = clamp((scroller.scrollTop - runwayStart) / R);
  if (Math.abs(to - p0) < 0.01) { scroller.scrollTop = runwayStart + to * R; render(); return; }
  const dur = Math.max(160, (reduce.matches ? 300 : TRANSITION_MS) * Math.abs(to - p0));
  // starting slope in units of the whole travel; at most 3 keeps the curve from overshooting the end
  const m = reduce.matches ? 0 : clamp((Math.max(0, vel) * dur) / (R * Math.abs(to - p0)), 0, 3);
  anim = { from: p0, to, start: performance.now(), dur, m };
  // stop the browser's own momentum: after a touch flick it would keep scrolling and fight the clock
  // (the view jerked backwards on phones). Code can still set scrollTop on an overflow:hidden box.
  scroller.style.overflowY = 'hidden';
  if (!animRaf) animRaf = requestAnimationFrame(animTick);   // the clock drives the transition, not scroll events
}
scroller.addEventListener('scroll', () => {
  const st = scroller.scrollTop, now = performance.now();
  const max = scroller.scrollHeight - scroller.clientHeight;
  // scroll speed from consecutive events (one per frame during a flick); hands the flick's speed to the clock
  if (!anim && wasSt >= 0 && now > wasT) scrollVel = (st - wasSt) / (now - wasT);
  wasT = now;
  // crossing the trigger line downwards starts the transition as one fluid motion. A reverse ends
  // by setting scrollTop to runwayStart, which the browser rounds, sometimes to just above it; the
  // 1 px band counts that resting position as "at the line", so the next nudge down re-triggers.
  if (!anim && wasSt >= 0 && wasSt <= runwayStart + 1 && st > runwayStart + 1 && st < max - 1) startAnim(1, scrollVel);
  wasSt = st;
  const bottom = atBottom();
  if (bottom && !wasBottom) settleUntil = performance.now() + SETTLE_MS;      // pause before the jack takes over
  wasBottom = bottom;
  // while the transition runs, animTick() already renders once per frame; the scrollTop it writes
  // fires this listener, and a second render here would draw the canvas twice per frame (NFR-04)
  if (!rq && !anim) rq = requestAnimationFrame(() => { rq = 0; render(); });
}, { passive: true });
const atBottom = () => scroller.scrollTop >= scroller.scrollHeight - scroller.clientHeight - 2;

/* ---------- Input in the works section ---------- */
// Wheel: at the bottom, vertical input moves the track (FR-06). Upward input at the first card scrolls the page up (FR-03).
scroller.addEventListener('wheel', (e) => {
  if (anim) { e.preventDefault(); return; }                    // the transition drives the view
  if (performance.now() < lockUntil) { e.preventDefault(); return; }   // the flow-in suspends scrolling
  if (!atBottom()) return;                                     // native scroll; crossing the trigger starts the transition
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;         // FR-07: native horizontal input
  const dy = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY;
  // brief pause at a boundary (arriving at the bottom, or back at the first card): wheel momentum
  // is absorbed here, before it can roll on into the jack or into the reverse transition
  if (performance.now() < settleUntil) { e.preventDefault(); return; }
  if (dy < 0 && track.scrollLeft <= 2 && (target === null || target <= 2)) { e.preventDefault(); startAnim(0); return; }   // reverse transition (FR-03, FR-18)
  if (reduce.matches) return;                                  // FR-19: no scroll-jacking with reduced motion
  e.preventDefault(); jack(dy);
}, { passive: false });

// Touch: at the bottom, a vertical swipe moves the track. A downward swipe at the first card scrolls the page up.
let tx = 0, ty = 0, gesture = null;
scroller.addEventListener('touchstart', (e) => { const t = e.touches[0]; tx = t.clientX; ty = t.clientY; gesture = null; }, { passive: true });
scroller.addEventListener('touchmove', (e) => {
  const t = e.touches[0], dx = tx - t.clientX, dy = ty - t.clientY;
  if (anim || performance.now() < lockUntil) { e.preventDefault(); return; }   // transition or flow-in suspends scrolling
  if (gesture === null) {
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
    if (!atBottom() || reduce.matches || Math.abs(dx) > Math.abs(dy)) gesture = 'native';
    else if (dy < 0 && track.scrollLeft <= 2) gesture = 'reverse';   // swipe down at the first card: reverse transition
    else gesture = 'jack';
  }
  if (gesture === 'reverse') { e.preventDefault(); gesture = null; startAnim(0); return; }
  if (gesture !== 'jack') return;
  e.preventDefault();
  track.scrollLeft = clamp(track.scrollLeft + dy, 0, trackMax());
  tx = t.clientX; ty = t.clientY;
}, { passive: false });

// Keyboard (FR-08, FR-03)
const SCROLL_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' '];
window.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  if ($('#detail').classList.contains('open')) { if (e.key === 'Escape') closeDetail(); return; }
  if (anim || performance.now() < lockUntil) {               // the transition and the flow-in suspend scrolling, keys included
    const typing = e.target.closest?.('input, textarea, select');
    const pressing = e.key === ' ' && e.target.closest?.('button, [role="button"]');
    if (!typing && !pressing && SCROLL_KEYS.includes(e.key)) e.preventDefault();   // no native scroll to fight the clock
    return;
  }
  if (!atBottom()) return;
  const tag = document.activeElement ? document.activeElement.tagName : '';
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
  const i = currentIndex();
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goToCard(Math.min(i + 1, PROJECTS.length - 1), true); }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (i === 0 && track.scrollLeft <= 2) startAnim(0);
    else goToCard(Math.max(i - 1, 0), true);
  }
});
$('#enterWorks').addEventListener('click', () => scroller.scrollTo({ top: scroller.scrollHeight, behavior: reduce.matches ? 'auto' : 'smooth' }));
$('#home').addEventListener('click', (e) => {
  e.preventDefault();
  if ($('#detail').classList.contains('open')) closeDetail();
  if (clamp((scroller.scrollTop - runwayStart) / R) > 0) { pendingHome = true; startAnim(0); }
  else scroller.scrollTo({ top: 0, behavior: reduce.matches ? 'auto' : 'smooth' });
});

/* ---------- Detail view with its own URL (FR-13 to FR-17) ---------- */
const detail = $('#detail');
let lastCard = null, pushed = false;
function setClip(r) {
  const box = detail.getBoundingClientRect();
  detail.style.setProperty('--ct', Math.max(0, r.top - box.top) + 'px');
  detail.style.setProperty('--cl', Math.max(0, r.left - box.left) + 'px');
  detail.style.setProperty('--cr', Math.max(0, box.right - r.right) + 'px');
  detail.style.setProperty('--cb2', Math.max(0, box.bottom - r.bottom) + 'px');
}
/* The detail view holds every project's blocks in both languages (ProjectDetail.astro); only the open
   project's set in the active language shows, and hidden sets never load their media (FR-17, NFR-05). */
let openId = null;
/* The detail head mirrors the card: title, the year in accent, the tags (CR-29). */
function fillDetailHead(p) {
  $('#detailTitle').textContent = p.headline;
  const span = (cls, text) => { const s = document.createElement('span'); if (cls) s.className = cls; s.textContent = text; return s; };
  $('#detailMeta').replaceChildren(span('m-title', p.title), ' ', span('m-year', p.year));
  $('#detailTags').replaceChildren(...p.tags.map((t) => span('', t)));
}
function showBlocks(id) {
  openId = id;
  $$('.detail-blocks').forEach((b) => { b.hidden = !(b.dataset.project === id && b.dataset.lang === lang); });
  const p = PROJECTS.find((x) => x.id === id);
  if (p) fillDetailHead(p);
}
function openDetail(id, fromCard) {
  const p = PROJECTS.find((x) => x.id === id); if (!p) return;
  showBlocks(id);
  lastCard = cards().find((c) => c.dataset.id === id) || null;
  detail.classList.add('open');
  if (lastCard && fromCard && !reduce.matches) {
    detail.style.transition = 'none'; setClip(lastCard.getBoundingClientRect()); detail.getBoundingClientRect(); detail.style.transition = '';   /* forced reflow: commit the clip-path start value (FR-13) */
  }
  requestAnimationFrame(() => ['--ct', '--cl', '--cr', '--cb2'].forEach((v) => detail.style.setProperty(v, '0px')));
  detail.scrollTop = 0; detail.focus({ preventScroll: true });
}
function closeDetail() {
  if (!detail.classList.contains('open')) return;
  if (pushed) { pushed = false; history.back(); return; }  // Back behaves like close (FR-16)
  history.replaceState(null, '', prefix() + '/works'); hideDetail();
}
function hideDetail() {
  openId = null;
  const done = () => { detail.classList.remove('open'); if (lastCard) lastCard.focus({ preventScroll: true }); };
  if (lastCard && !reduce.matches) { setClip(lastCard.getBoundingClientRect()); setTimeout(done, 520); } else done();
}
track.addEventListener('click', (e) => {
  const a = e.target.closest('.card'); if (!a) return;
  e.preventDefault();
  if (e.target.closest('.media-retry')) return;   // a failed thumbnail's retry reloads the image, not the project (FR-51)
  pushed = true;
  history.pushState(null, '', prefix() + '/works/' + a.dataset.id);
  openDetail(a.dataset.id, true);
});
$('#detailClose').addEventListener('click', closeDetail);
window.addEventListener('popstate', () => {
  pushed = false;
  if (urlLang() !== lang) { lang = urlLang(); applyLang(); }   // an entry from before a language switch
  route();
});
function route() {
  const m = stripLang(location.pathname).match(/^\/works(?:\/([\w-]+))?\/?$/);
  if (!m) { if (detail.classList.contains('open')) hideDetail(); return; }
  if (!atBottom()) { scroller.scrollTop = scroller.scrollHeight; render(); }
  if (m[1]) openDetail(m[1], false); else if (detail.classList.contains('open')) hideDetail();
}

/* ---------- Media items (FR-50 to FR-52) ----------
   Each [data-media] box (MediaBox.astro) arms when it comes near the view: images are lazy, videos and
   preview iframes only get their address then. Until the item loads, the box shows the looping v-stack
   loader at the item's final size; after 15 s or an error it shows a message and a retry button. */
const MEDIA_TIMEOUT_MS = 15000;
function watchMedia(box, el) {
  let timer = 0;
  const settle = (ok) => { clearTimeout(timer); box.dataset.state = ok ? 'loaded' : 'failed'; };
  box.dataset.state = 'loading';
  timer = setTimeout(() => { if (box.dataset.state === 'loading') settle(false); }, MEDIA_TIMEOUT_MS);
  if (el.tagName === 'IMG') {
    el.addEventListener('load', () => settle(true), { once: true });
    el.addEventListener('error', () => settle(false), { once: true });
    if (el.complete) settle(el.naturalWidth > 0);   // finished (or failed) before the box armed
  } else if (el.tagName === 'VIDEO') {
    el.addEventListener('loadedmetadata', () => settle(true), { once: true });
    el.addEventListener('error', () => settle(false), { once: true });
    if (el.dataset.poster) el.poster = el.dataset.poster;
    el.preload = 'metadata';
    el.src = el.dataset.src;
  } else {
    el.addEventListener('load', () => settle(true), { once: true });
    el.src = el.dataset.src;
  }
}
function armMedia(box) {
  if (box.dataset.state) return;
  const el = box.querySelector('img, video, iframe');
  if (el) watchMedia(box, el);
}
const mediaObserver = new IntersectionObserver((entries) => entries.forEach((e) => {
  if (e.isIntersecting) { mediaObserver.unobserve(e.target); armMedia(e.target); }
}), { rootMargin: '200px' });
$$('[data-media]').forEach((box) => mediaObserver.observe(box));
document.addEventListener('click', (e) => {   // FR-51: retry starts a new load of that item
  const btn = e.target.closest('.media-retry'); if (!btn) return;
  const box = btn.closest('[data-media]'), old = box.querySelector('img, video, iframe');
  const fresh = old.cloneNode(true);   // a new element makes a new request, not a replay of the cached failure
  fresh.removeAttribute('src');
  if (fresh.tagName === 'IMG') {
    /* a new address too: Chrome and WebKit attach a new <img> with the same URL to a request still in
       flight, so after a stall the retry would wait on the stalled request */
    const bust = (u) => { const base = u.replace(/[?&]retry=\d+/, ''); return base + (base.includes('?') ? '&' : '?') + 'retry=' + Date.now(); };
    const set = old.getAttribute('srcset');
    if (set) fresh.srcset = set.split(',').map((c) => c.trim().split(/\s+/)).map(([u, w]) => bust(u) + (w ? ' ' + w : '')).join(', ');
    fresh.src = bust(old.getAttribute('src'));
  }
  old.replaceWith(fresh);
  watchMedia(box, fresh);
});

/* ---------- Contact overlay and form (FR-25 to FR-37) ---------- */
const dlg = $('#contact'), form = $('#contactForm');
let returnFocus = null;
$$('[data-open-contact]').forEach((b) => b.addEventListener('click', () => { returnFocus = b; $('#status').textContent = ''; dlg.showModal(); $('#name').focus(); loadTurnstile(); }));

/* Cloudflare Turnstile (FR-32, ADR-0005): the script loads the first time the overlay opens, so
   visitors who never open the form never contact Cloudflare. Managed mode usually passes without
   a click; the token is single-use, so the widget resets after every submission. */
let tsWidget = null, tsLoading = false;
function loadTurnstile() {
  if (tsLoading || !PUBLIC_TURNSTILE_SITE_KEY) return;
  tsLoading = true;
  window.onTurnstileLoad = () => {
    tsWidget = window.turnstile.render('.turnstile', { sitekey: PUBLIC_TURNSTILE_SITE_KEY, language: lang, theme: isDark() ? 'dark' : 'light', size: 'flexible' });
  };
  const s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad';
  s.async = true;
  document.head.append(s);
}
const tsToken = () => (tsWidget !== null && window.turnstile ? window.turnstile.getResponse(tsWidget) || '' : '');
const tsReset = () => { if (tsWidget !== null && window.turnstile) window.turnstile.reset(tsWidget); };
$('#contactClose').addEventListener('click', () => dlg.close());
dlg.addEventListener('close', () => { if (returnFocus) returnFocus.focus({ preventScroll: true }); });   // FR-27: same position
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
$('#message').addEventListener('input', (e) => { $('#count').textContent = e.target.value.length + ' / 3000'; });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function check(field, ok, msgKey) {
  $('#f-' + field).dataset.invalid = String(!ok);
  $('#' + field).setAttribute('aria-invalid', String(!ok));
  $('#e-' + field).textContent = ok ? '' : T[lang][msgKey];
  return ok;
}
function validate() {
  const a = check('name', $('#name').value.trim().length > 0, 'errName');
  const b = check('email', EMAIL.test($('#email').value.trim()), 'errEmail');
  const c = check('message', $('#message').value.trim().length > 0 && $('#message').value.length <= 3000, 'errMessage');
  return a && b && c;
}
['name', 'email', 'message'].forEach((id) => $('#' + id).addEventListener('blur', () => { if ($('#f-' + id).dataset.invalid === 'true') validate(); }));
const FIELD_ERR = { name: 'errName', email: 'errEmail', message: 'errMessage' };
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validate()) { const first = $('.field[data-invalid="true"] input, .field[data-invalid="true"] textarea'); if (first) first.focus(); return; }
  const status = $('#status'); status.className = 'status';
  const token = tsToken();
  if (!token) { status.textContent = T[lang].errVerify; return; }   // the widget has not passed yet
  status.textContent = T[lang].sending; $('#sendBtn').disabled = true;
  let res = null, out = {};
  try {
    res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: $('#name').value, email: $('#email').value, message: $('#message').value, lang, token }),
    });
    out = await res.json().catch(() => ({}));
  } catch { /* network failure: handled as a failed send below */ }
  $('#sendBtn').disabled = false;
  tsReset();
  if (res && res.ok) {   // FR-35: on-screen confirmation, no email to the sender
    status.className = 'status ok'; status.textContent = T[lang].sent; form.reset(); $('#count').textContent = '0 / 3000';
    return;
  }
  if (res && res.status === 400 && Array.isArray(out.fields)) {   // the server's field check (FR-29, FR-30)
    out.fields.forEach((f) => { if (FIELD_ERR[f]) check(f, false, FIELD_ERR[f]); });
    status.textContent = '';
    return;
  }
  status.textContent = res && res.status === 403 ? T[lang].errVerify : T[lang].failed;   // FR-36: the text stays
});

/* ---------- Mobile footer collapse (owner direction; collapsed by default, CR-25) ---------- */
const mqMobile = window.matchMedia('(max-width: 767px)');
function syncWfAria() {
  const open = !mqMobile.matches || $('.works-footer').classList.contains('open');
  $('#wfToggle').setAttribute('aria-expanded', String(open));
}
mqMobile.addEventListener('change', syncWfAria);
$('#wfToggle')?.addEventListener('click', () => {
  $('.works-footer').classList.toggle('open');
  syncWfAria();
});
syncWfAria();

/* ---------- Start ---------- */
applyLang();
runLoader();
layout();
route();   // a direct /works or /works/<id> address puts the view in the works section first (FR-15)
routed = true;
render();
scroller.focus({ preventScroll: true });
let rz = 0;
window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { const wasBottom = atBottom(); layout(); if (wasBottom) scroller.scrollTop = scroller.scrollHeight; updateIndicator(); }, 120); });
if (document.fonts) document.fonts.ready.then(layout);
})();
