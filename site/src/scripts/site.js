import { T } from '../i18n/ui.js';

(() => {
'use strict';

/* ---------- Settings ---------- */
const LOADER_MS = 1200;        // FR-48: replace with the measured average time to "intro ready" (max 2000)
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

/* ---------- Language (FR-21, FR-22) ---------- */
const prefs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || 'en'];
let lang = store.get('lang') || (String(prefs[0]).toLowerCase().startsWith('de') ? 'de' : 'en');
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
$$('.lang button').forEach((b) => b.addEventListener('click', () => { lang = b.dataset.lang; store.set('lang', lang); applyLang(); }));

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
    .then(() => { ready = true; if (filled) finish(); });
  setTimeout(() => { filled = true; if (ready) finish(); else { el.classList.remove('run'); el.classList.add('loop'); } }, reduce.matches ? 0 : LOADER_MS);
}
$('#replayLoader')?.addEventListener('click', runLoader);

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
    a.querySelector('h3').textContent = p.headline;
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
function barTo(clientX) {
  const r = bar.getBoundingClientRect(), n = PROJECTS.length, w = r.width * (1 / n);
  const ratio = clamp((clientX - r.left - w / 2) / (r.width - w));
  target = null; track.scrollLeft = ratio * trackMax();
}
bar.addEventListener('pointerdown', (e) => { bar.setPointerCapture(e.pointerId); barTo(e.clientX); });
bar.addEventListener('pointermove', (e) => { if (bar.hasPointerCapture(e.pointerId)) barTo(e.clientX); });
bar.addEventListener('keydown', (e) => {
  const i = currentIndex();
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); goToCard(Math.min(i + 1, PROJECTS.length - 1)); }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); goToCard(Math.max(i - 1, 0)); }
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
function render() {
  let p;
  if (anim) {
    // the transition is its own animation: progress runs on the clock and drives the view
    const t = clamp((performance.now() - anim.start) / anim.dur);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    p = anim.from + (anim.to - anim.from) * e;
    scroller.scrollTop = runwayStart + p * R;
    if (t >= 1) {
      anim = null;
      if (pendingHome) { pendingHome = false; scroller.scrollTo({ top: 0, behavior: reduce.matches ? 'auto' : 'smooth' }); }
    }
  } else {
    p = clamp((scroller.scrollTop - runwayStart) / R);
  }
  const st = scroller.scrollTop;
  let f = clamp((p - (0.5 - LOOK.fade / 2)) / LOOK.fade); f = f * f * (3 - 2 * f);
  document.body.classList.toggle('mode-works', f >= 0.5);

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
  if (atWorks !== lastWorksHash && !$('#detail').classList.contains('open')) {
    lastWorksHash = atWorks;
    if (atWorks && !location.hash.startsWith('#/works')) history.replaceState(null, '', '#/works');
    if (!atWorks && location.hash.startsWith('#/works')) history.replaceState(null, '', location.pathname + location.search);
  }
}
let rq = 0, settleUntil = 0, wasBottom = false, wasFirstCard = true;
let flowLockMs = 0, lockUntil = 0, wasArrived = false, flowSettleAt = 0;
let anim = null, wasSt = -1, pendingHome = false, animRaf = 0;
function animTick() {
  render();
  animRaf = anim ? requestAnimationFrame(animTick) : 0;
}
function startAnim(to) {
  const p0 = clamp((scroller.scrollTop - runwayStart) / R);
  if (Math.abs(to - p0) < 0.01) { scroller.scrollTop = runwayStart + to * R; render(); return; }
  anim = { from: p0, to, start: performance.now(), dur: Math.max(160, (reduce.matches ? 300 : TRANSITION_MS) * Math.abs(to - p0)) };
  if (!animRaf) animRaf = requestAnimationFrame(animTick);   // the clock drives the transition, not scroll events
}
scroller.addEventListener('scroll', () => {
  const st = scroller.scrollTop;
  const max = scroller.scrollHeight - scroller.clientHeight;
  // crossing the trigger line downwards starts the transition as one fluid motion. A reverse ends
  // by setting scrollTop to runwayStart, which the browser rounds, sometimes to just above it; the
  // 1 px band counts that resting position as "at the line", so the next nudge down re-triggers.
  if (!anim && wasSt >= 0 && wasSt <= runwayStart + 1 && st > runwayStart + 1 && st < max - 1) startAnim(1);
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
function openDetail(id, fromCard) {
  const p = PROJECTS.find((x) => x.id === id); if (!p) return;
  $('#detailTitle').textContent = p.headline;
  $('#detailMeta').textContent = p.title + '   ' + p.year;
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
  history.replaceState(null, '', '#/works'); hideDetail();
}
function hideDetail() {
  const done = () => { detail.classList.remove('open'); if (lastCard) lastCard.focus({ preventScroll: true }); };
  if (lastCard && !reduce.matches) { setClip(lastCard.getBoundingClientRect()); setTimeout(done, 520); } else done();
}
track.addEventListener('click', (e) => {
  const a = e.target.closest('.card'); if (!a) return;
  e.preventDefault(); pushed = true;
  history.pushState(null, '', '#/works/' + a.dataset.id);
  openDetail(a.dataset.id, true);
});
$('#detailClose').addEventListener('click', closeDetail);
window.addEventListener('popstate', () => { pushed = false; route(); });
function route() {
  const m = location.hash.match(/^#\/works(?:\/([\w-]+))?/);
  if (!m) { if (detail.classList.contains('open')) hideDetail(); return; }
  if (!atBottom()) { scroller.scrollTop = scroller.scrollHeight; render(); }
  if (m[1]) openDetail(m[1], false); else if (detail.classList.contains('open')) hideDetail();
}
$('#demoRange').addEventListener('input', (e) => { const v = e.target.value + 'px'; $('#demoDot').style.width = v; $('#demoDot').style.height = v; });

/* ---------- Contact overlay and form (FR-25 to FR-37) ---------- */
const dlg = $('#contact'), form = $('#contactForm');
let returnFocus = null;
$$('[data-open-contact]').forEach((b) => b.addEventListener('click', () => { returnFocus = b; $('#status').textContent = ''; dlg.showModal(); $('#name').focus(); }));
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
form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validate()) { const first = $('.field[data-invalid="true"] input, .field[data-invalid="true"] textarea'); if (first) first.focus(); return; }
  // Real build: POST to a server function that verifies the Turnstile token, sanitizes input,
  // applies the rate limit (3 per 10 min) and sends the mail (FR-31 to FR-35).
  const status = $('#status'); status.className = 'status'; status.textContent = T[lang].sending; $('#sendBtn').disabled = true;
  setTimeout(() => {
    $('#sendBtn').disabled = false;
    if ($('#simFail')?.checked) { status.textContent = T[lang].failed; return; }   // FR-37: text stays
    status.className = 'status ok'; status.textContent = T[lang].sent; form.reset(); $('#count').textContent = '0 / 3000';
  }, 700);
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
route();
scroller.focus({ preventScroll: true });
let rz = 0;
window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { const wasBottom = atBottom(); layout(); if (wasBottom) scroller.scrollTop = scroller.scrollHeight; updateIndicator(); }, 120); });
if (document.fonts) document.fonts.ready.then(layout);
})();
