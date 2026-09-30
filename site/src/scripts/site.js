import { T } from '../i18n/ui.js';

(() => {
'use strict';

/* ---------- Settings ---------- */
const LOADER_MS = 1200;          // FR-48: replace with the measured average time to "intro ready" (max 2000)
const TRANSITION_MS = 1800;      // grain transition duration
const FADE_WIDTH = 0.30;         // background cross-fade takes 30% of the transition, centred on 50%
const RISE_SPREAD = 0.34;        // how much earlier the lowest circles start than the highest
const BACK_THRESHOLD = 80;       // px of backward wheel input at the first card before FR-03 fires
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

/* ---------- Content (Astro content collection: src/content/projects) ---------- */
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

/* ---------- Language (FR-21, FR-22) ---------- */
// German browser language shows German, every other language shows English
const prefs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || 'en'];
let lang = store.get('lang') || (String(prefs[0]).toLowerCase().startsWith('de') ? 'de' : 'en');
function renderStatement() {
  const s = T[lang].statement, h1 = $('#statement');
  h1.textContent = '';
  h1.append(s[0]);
  const n = document.createElement('span'); n.className = 'name'; n.textContent = s[1]; h1.append(n);
  h1.append(s[2]);
  const hl = document.createElement('span'); hl.className = 'hl'; hl.textContent = s[3]; h1.append(hl);
  h1.append(s[4]);
}
function applyLang() {
  localizeCards();
  document.documentElement.lang = lang;
  renderStatement();
  $$('[data-i18n]').forEach((el) => { const v = T[lang][el.dataset.i18n]; if (v != null) el.textContent = v; });
  $$('[data-i18n-label]').forEach((el) => el.setAttribute('aria-label', T[lang][el.dataset.i18nLabel]));
  $$('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  $('#track').setAttribute('aria-label', T[lang].projects);
  updateThemeLabel();
}
$$('.lang button').forEach((b) => b.addEventListener('click', () => { lang = b.dataset.lang; store.set('lang', lang); applyLang(); }));

/* ---------- Theme (FR-24, FR-25) ---------- */
const sysDark = window.matchMedia('(prefers-color-scheme: dark)');
const savedTheme = store.get('theme');
if (savedTheme === 'light' || savedTheme === 'dark') document.documentElement.dataset.theme = savedTheme;
const isDark = () => document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : sysDark.matches;
function updateThemeLabel() { $('#themeBtn').setAttribute('aria-label', isDark() ? T[lang].toLight : T[lang].toDark); }
$('#themeBtn').addEventListener('click', () => {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next; store.set('theme', next); updateThemeLabel();
});
sysDark.addEventListener('change', updateThemeLabel);

/* ---------- Page loader (FR-47 to FR-49, FR-52) ---------- */
function runLoader() {
  const el = $('#loader');
  el.classList.remove('done', 'loop'); el.classList.add('run'); document.body.classList.remove('ready');
  el.style.setProperty('--fill-ms', LOADER_MS + 'ms');
  let filled = false, ready = false;
  const finish = () => { el.classList.add('done'); document.body.classList.add('ready'); };
  const slow = $('#simSlow')?.checked ? 3500 : 0;
  Promise.all([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise((r) => setTimeout(r, slow))])
    .then(() => { ready = true; if (filled) finish(); });
  setTimeout(() => { filled = true; if (ready) finish(); else { el.classList.remove('run'); el.classList.add('loop'); } }, reduce.matches ? 0 : LOADER_MS);
}
$('#replayLoader')?.addEventListener('click', runLoader);

/* ---------- Works track ---------- */
const track = $('#track');
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
const step = () => { const c = cards(); return c.length > 1 ? c[1].offsetLeft - c[0].offsetLeft : track.clientWidth; };
function currentIndex() {
  if (track.scrollLeft >= track.scrollWidth - track.clientWidth - 2) return PROJECTS.length - 1;   // end of the track
  return clamp(Math.round(track.scrollLeft / step()), 0, PROJECTS.length - 1);
}
function updateIndicator() {
  const i = currentIndex(), n = PROJECTS.length;
  $('#pos').textContent = (i + 1) + ' / ' + n;
  const max = Math.max(1, track.scrollWidth - track.clientWidth);
  $('#barFill').style.left = (track.scrollLeft / max * (100 - 100 / n)) + '%';
  $('#barFill').style.width = (100 / n) + '%';
}
track.addEventListener('scroll', updateIndicator, { passive: true });

/* smooth scroll-jacking target (FR-06) */
let target = null, raf = 0;
function jack(delta) {
  const max = track.scrollWidth - track.clientWidth;
  if (target === null) target = track.scrollLeft;
  target = clamp(target + delta, 0, max);
  if (!raf) raf = requestAnimationFrame(tick);
}
function tick() {
  const cur = track.scrollLeft, next = cur + (target - cur) * 0.2;
  track.scrollLeft = Math.abs(target - next) < 0.5 ? target : next;
  const moved = Math.abs(track.scrollLeft - cur) >= 0.5;   // stop when the track can not move further
  if (moved && Math.abs(track.scrollLeft - target) > 0.5) raf = requestAnimationFrame(tick); else { cancelAnimationFrame(raf); raf = 0; target = null; }
}
function goToCard(i, focus) {
  const c = cards()[i]; if (!c) return;
  track.scrollTo({ left: c.offsetLeft - cards()[0].offsetLeft, behavior: reduce.matches ? 'auto' : 'smooth' });
  if (focus) c.focus({ preventScroll: true });
}

/* ---------- Grain transition (FR-02, FR-03, FR-18) ---------- */
const canvas = $('#grain'), ctx = canvas.getContext('2d');
let pts = [], W = 0, H = 0, animating = false;
function mulberry(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function buildPoints() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cell = clamp(W / 12, 64, 130), rnd = mulberry(7);
  pts = [];
  for (let gy = -1; gy < H / cell + 1; gy++) for (let gx = -1; gx < W / cell + 2; gx++) {
    pts.push({ x: gx * cell + cell * (0.12 + 0.76 * rnd()) - (gy % 2 ? cell / 2 : 0), y: gy * cell + cell * (0.12 + 0.76 * rnd()), k: 0.55 + 0.45 * rnd(), j: rnd() });
  }
  // circles never overlap: each radius is capped by the distance to the nearest neighbour
  for (const p of pts) {
    let m = Infinity;
    for (const q of pts) if (q !== p) { const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2; if (d < m) m = d; }
    p.maxR = Math.max(0, Math.sqrt(m) / 2 - cell * 0.05);
  }
}
const hexRGB = (h) => { h = h.trim(); if (h.startsWith('#')) return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const m = h.match(/\d+(\.\d+)?/g); return m ? m.slice(0, 3).map(Number) : [0, 0, 0]; };
const mix = (a, b, f) => 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * f)).join(',') + ')';
function drawFrame(prog, A, B) {
  let f = clamp((prog - (0.5 - FADE_WIDTH / 2)) / FADE_WIDTH); f = f * f * (3 - 2 * f);
  ctx.clearRect(0, 0, W, H);
  ctx.globalAlpha = clamp(prog / 0.35);              // intro content fades out under the transition
  ctx.fillStyle = mix(A, B, f); ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.fillStyle = mix(B, A, f);                       // circles use the inverted colours
  ctx.beginPath();
  for (const p of pts) {
    const delay = RISE_SPREAD * (1 - clamp(p.y / H)) * 0.85 + RISE_SPREAD * 0.15 * p.j;
    const tl = clamp((prog - delay) / (1 - RISE_SPREAD));
    const r = p.maxR * p.k * Math.pow(Math.sin(Math.PI * tl), 0.9);
    if (r < 0.5) continue;
    ctx.moveTo(p.x + r, p.y); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  }
  ctx.fill();
  document.body.classList.toggle('mode-works', f >= 0.5);
}
function playTransition(forward, done, onFirstFrame) {
  const cs = getComputedStyle(document.documentElement);
  const A = hexRGB(cs.getPropertyValue('--bg')), B = hexRGB(cs.getPropertyValue('--works'));
  animating = true;
  if (reduce.matches) {                               // FR-18: simple fade instead of the grain
    const w = $('#works');
    w.style.opacity = forward ? '0' : '1'; w.classList.add('show');
    requestAnimationFrame(() => { w.style.opacity = forward ? '1' : '0'; });
    document.body.classList.toggle('mode-works', forward);
    if (onFirstFrame) onFirstFrame();
    setTimeout(() => { w.style.opacity = ''; animating = false; done(); }, 320);
    return;
  }
  buildPoints(); canvas.style.display = 'block';
  let t0 = null, first = true;
  const frame = (now) => {
    if (t0 === null) t0 = now;
    const t = clamp((now - t0) / TRANSITION_MS);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    drawFrame(forward ? e : 1 - e, A, B);
    if (first) { first = false; if (onFirstFrame) onFirstFrame(); }
    if (t < 1) requestAnimationFrame(frame);
    else { animating = false; done(); requestAnimationFrame(() => { canvas.style.display = 'none'; }); }
  };
  requestAnimationFrame(frame);
}

/* ---------- Mode switching ---------- */
let mode = 'intro';
function showWorks(instant) {
  if (mode !== 'intro' || animating) return;
  mode = 'works';
  document.body.classList.add('lock');
  if (!location.hash.startsWith('#/works')) history.replaceState(null, '', '#/works');
  const finish = () => {
    const w = $('#works'); w.classList.add('show'); w.inert = false; $('#intro').inert = true;
    document.body.classList.add('mode-works');
    requestAnimationFrame(() => w.classList.add('settled'));
    updateIndicator(); goToCard(0, false);
  };
  if (instant) finish(); else playTransition(true, finish);
}
function showIntro() {
  if (mode !== 'works' || animating) return;
  mode = 'intro';
  history.replaceState(null, '', location.pathname + location.search);
  const w = $('#works');
  const start = () => {
    w.classList.remove('settled'); if (!reduce.matches) w.classList.remove('show'); w.inert = true; $('#intro').inert = false;
    window.scrollTo(0, document.documentElement.scrollHeight);
  };
  playTransition(false, () => {
    w.classList.remove('show'); document.body.classList.remove('lock', 'mode-works');
    $('#enterWorks').focus({ preventScroll: true });
  }, start);
}

/* intro: continuing down at the end of the intro starts the transition */
const atBottom = () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
let fwdAcc = 0, backAcc = 0, accTimer = 0;
const resetAcc = () => { clearTimeout(accTimer); accTimer = setTimeout(() => { fwdAcc = 0; backAcc = 0; }, 400); };
window.addEventListener('wheel', (e) => {
  if (document.querySelector('dialog[open]') || $('#detail').classList.contains('open')) return;
  if (mode === 'intro') {
    if (e.deltaY > 0 && atBottom()) { fwdAcc += e.deltaY; resetAcc(); if (fwdAcc > BACK_THRESHOLD) { fwdAcc = 0; showWorks(false); } }
    return;
  }
  if (animating) { e.preventDefault(); return; }
  const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
  if (horizontal) return;                                  // FR-07: native horizontal scrolling
  if (reduce.matches) {                                    // FR-19: no scroll-jacking with reduced motion
    if (e.deltaY < 0 && track.scrollLeft <= 1) { backAcc -= e.deltaY; resetAcc(); if (backAcc > BACK_THRESHOLD) { backAcc = 0; showIntro(); } }
    return;
  }
  e.preventDefault();
  const dy = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY;
  if (dy < 0 && track.scrollLeft <= 1 && (target === null || target <= 1)) { backAcc -= dy; resetAcc(); if (backAcc > BACK_THRESHOLD) { backAcc = 0; showIntro(); } return; }
  jack(dy);                                                // FR-06: vertical input moves the track sideways
}, { passive: false });

/* touch: vertical swipe converts to horizontal movement (FR-06), horizontal swipe stays native (FR-07) */
let tx = 0, ty = 0, tAxis = null;
window.addEventListener('touchstart', (e) => { const t = e.touches[0]; tx = t.clientX; ty = t.clientY; tAxis = null; }, { passive: true });
window.addEventListener('touchmove', (e) => {
  if (document.querySelector('dialog[open]') || $('#detail').classList.contains('open')) return;
  const t = e.touches[0], dx = tx - t.clientX, dy = ty - t.clientY;
  if (mode === 'intro') { if (dy > 60 && atBottom()) showWorks(false); return; }
  if (tAxis === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) tAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
  if (tAxis !== 'y') return;
  e.preventDefault();
  if (reduce.matches) { if (dy < -60 && track.scrollLeft <= 1) showIntro(); return; }
  if (dy < -60 && track.scrollLeft <= 1) { showIntro(); return; }
  track.scrollLeft += dy; tx = t.clientX; ty = t.clientY;
}, { passive: false });

/* keyboard (FR-08, FR-03) */
window.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  if ($('#detail').classList.contains('open')) { if (e.key === 'Escape') closeDetail(); return; }
  if (mode === 'intro') {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || (e.key === ' ' && ['BUTTON', 'A'].includes(tag))) return;
    if (['ArrowDown', 'PageDown', ' '].includes(e.key) && atBottom()) { e.preventDefault(); showWorks(false); }
    return;
  }
  if (animating) return;
  const i = currentIndex();
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goToCard(Math.min(i + 1, PROJECTS.length - 1), true); }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); if (i === 0 && track.scrollLeft <= 1) showIntro(); else goToCard(Math.max(i - 1, 0), true); }
});
$('#enterWorks').addEventListener('click', () => showWorks(false));
$('#home').addEventListener('click', (e) => { e.preventDefault(); if ($('#detail').classList.contains('open')) closeDetail(); if (mode === 'works') showIntro(); else window.scrollTo({ top: 0, behavior: reduce.matches ? 'auto' : 'smooth' }); });

/* ---------- Detail view with its own URL (FR-13 to FR-17) ---------- */
const detail = $('#detail');
let lastCard = null, pushed = false;
function openDetail(id, fromCard) {
  const p = PROJECTS.find((x) => x.id === id); if (!p) return;
  $('#detailTitle').textContent = p.headline;
  $('#detailMeta').textContent = p.title + '   ' + p.year;
  const card = cards().find((c) => c.dataset.id === id);
  lastCard = card || null;
  detail.classList.add('open');
  const box = detail.getBoundingClientRect();
  if (card && fromCard && !reduce.matches) {
    const r = card.getBoundingClientRect();
    detail.style.transition = 'none';
    detail.style.setProperty('--ct', Math.max(0, r.top - box.top) + 'px');
    detail.style.setProperty('--cl', Math.max(0, r.left - box.left) + 'px');
    detail.style.setProperty('--cr', Math.max(0, box.right - r.right) + 'px');
    detail.style.setProperty('--cb2', Math.max(0, box.bottom - r.bottom) + 'px');
    detail.getBoundingClientRect();   /* forced reflow: commit the clip-path start value before re-enabling the transition (FR-13) */
    detail.style.transition = '';
  }
  ['--ct', '--cl', '--cr', '--cb2'].forEach((v) => requestAnimationFrame(() => detail.style.setProperty(v, '0px')));
  detail.scrollTop = 0; detail.focus({ preventScroll: true });
}
function closeDetail() {
  if (!detail.classList.contains('open')) return;
  if (pushed) { pushed = false; history.back(); return; }  // Back behaves like close (FR-16)
  history.replaceState(null, '', '#/works'); hideDetail();
}
function hideDetail() {
  const done = () => { detail.classList.remove('open'); if (lastCard) lastCard.focus({ preventScroll: true }); };
  if (lastCard && !reduce.matches) {
    const box = detail.getBoundingClientRect(), r = lastCard.getBoundingClientRect();
    detail.style.setProperty('--ct', Math.max(0, r.top - box.top) + 'px');
    detail.style.setProperty('--cl', Math.max(0, r.left - box.left) + 'px');
    detail.style.setProperty('--cr', Math.max(0, box.right - r.right) + 'px');
    detail.style.setProperty('--cb2', Math.max(0, box.bottom - r.bottom) + 'px');
    setTimeout(done, 520);
  } else done();
}
track.addEventListener('click', (e) => {
  const a = e.target.closest('.card'); if (!a) return;
  e.preventDefault(); pushed = true;
  history.pushState(null, '', '#/works/' + a.dataset.id);
  openDetail(a.dataset.id, true);
});
$('#detailClose').addEventListener('click', closeDetail);
window.addEventListener('popstate', () => { pushed = false; route(false); });
function route(initial) {
  const m = location.hash.match(/^#\/works(?:\/([\w-]+))?/);
  if (m) {
    if (mode === 'intro') showWorks(true);
    if (m[1]) openDetail(m[1], false); else if (detail.classList.contains('open')) hideDetail();
  } else if (!initial && mode === 'works' && (location.hash === '' || location.hash === '#')) {
    if (detail.classList.contains('open')) hideDetail();
    showIntro();
  }
}

/* demo component inside the detail view */
$('#demoRange').addEventListener('input', (e) => { const v = e.target.value + 'px'; $('#demoDot').style.width = v; $('#demoDot').style.height = v; });

/* ---------- Contact overlay and form (FR-25 to FR-37) ---------- */
const dlg = $('#contact'), form = $('#contactForm');
let returnFocus = null;
$$('[data-open-contact]').forEach((b) => b.addEventListener('click', () => { returnFocus = b; $('#status').textContent = ''; dlg.showModal(); $('#name').focus(); }));
$('#contactClose').addEventListener('click', () => dlg.close());
dlg.addEventListener('close', () => { if (returnFocus) returnFocus.focus({ preventScroll: true }); });  // FR-27: same position
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
$('#message').addEventListener('input', (e) => { $('#count').textContent = e.target.value.length + ' / 3000'; });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function check(field, ok, msgKey) {
  const f = $('#f-' + field); f.dataset.invalid = String(!ok);
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
    if ($('#simFail')?.checked) { status.textContent = T[lang].failed; return; }       // FR-37: text stays
    status.className = 'status ok'; status.textContent = T[lang].sent; form.reset(); $('#count').textContent = '0 / 3000';
  }, 700);
});

/* ---------- Start ---------- */
applyLang();
runLoader();
document.body.classList.remove('lock');
route(true);
window.addEventListener('resize', () => { if (mode === 'works') updateIndicator(); });
})();
