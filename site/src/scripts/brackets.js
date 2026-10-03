/* Corner-mark hover and focus (CR-30): drawn SVG brackets in place of the prototype's per-control
   .cb::after marks, which stay in global.css as the fallback when this script does not run.

   - One corner shape everywhere: 1.5 px, a 3 px rounding and round line ends, whatever the element's
     own radius, so the brackets match the site's soft edges without varying between elements.
   - Glide areas (header, footer, detail bar, contents rail, block set, contact dialog, legal page):
     one bracket per area glides from target to target on a spring; entering an area the corners
     converge onto the target, leaving it they fade.
   - Project cards do not glide: the bracket lives inside the hovered card, so it scales with the
     card's 1.03 hover exactly, converges in on enter and fades on leave. A glide between cards
     crossed 600 px while the cards scaled, dimmed and swapped titles, which read as a glitch.
   - The frame sits 6 px from a text or icon control's visible text or icon (--cbx and --cby in
     global.css pull it in from the box) and 6 px outside a boxed control (button, card, chip,
     contents entry, slider).
   - Hover (mouse and pen) and keyboard focus (:focus-visible) drive it; touch does not, and the
     brackets remain the focus indicator (owner note 9).
   - Reduced motion: no glide or converge, only a fade.
   Motion (motion.dev) animates through the Web Animations API; mini animate plus its spring. */
import { animate } from 'motion/mini';
import { spring } from 'motion';

const AREAS = '.site-header, .works-footer, .detail-bar, #detailToc, .detail-blocks, #contact, .indicator, .intro, .legal-sheet';
const IN_PLACE = '.card';
const GAP = 6;
const CONVERGE = 5; // the corners start this far outside the frame on enter
const STROKE = 1.5;
const RADIUS = 3;
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const root = document.documentElement;

const px = (v) => Math.round(v * devicePixelRatio) / devicePixelRatio;
const springy = () => ({ type: spring, visualDuration: 0.3, bounce: 0.12 });
const fade = () => ({ duration: 0.16, ease: 'easeOut' });
/* stop a bracket's running animation where it is; stop() commits the current styles, which throws when
   the element is no longer rendered (a closed dialog, a hidden view), so fall back to cancel() */
function halt(b) {
  const a = b.anim;
  b.anim = null;
  if (!a) return;
  try { a.stop(); } catch { a.cancel(); }
}

/* how far the frame sits outside the element's box on each axis (CR-30 geometry) */
function outset(el) {
  const cs = getComputedStyle(el);
  return { x: GAP - (parseFloat(cs.getPropertyValue('--cbx')) || 0), y: GAP - (parseFloat(cs.getPropertyValue('--cby')) || 0) };
}
function colorOf(el) {
  const cs = getComputedStyle(el);
  const c = cs.getPropertyValue('--cb').trim();
  return !c || /currentcolor/i.test(c) ? cs.color : c;
}
const armFor = (w, h) => Math.max(7, Math.min(16, Math.round(Math.min(w, h) * 0.3)));

/* the frame in viewport px, for a gliding bracket */
function frameOf(el) {
  const r = el.getBoundingClientRect();
  const o = outset(el);
  const w = r.width + 2 * o.x, h = r.height + 2 * o.y;
  return { x: px(r.left - o.x), y: px(r.top - o.y), w: px(w), h: px(h), arm: armFor(w, h), color: colorOf(el) };
}

/* the visible part of the viewport for a target: its clipping ancestors, intersected */
function clipOf(el, host) {
  let t = 0, l = 0, b = innerHeight, r = innerWidth;
  for (let a = el.parentElement; a && a !== host && a !== document.body && a !== root; a = a.parentElement) {
    const cs = getComputedStyle(a);
    if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
    const q = a.getBoundingClientRect();
    t = Math.max(t, q.top); l = Math.max(l, q.left); b = Math.min(b, q.bottom); r = Math.min(r, q.right);
  }
  return `inset(${t}px ${innerWidth - r}px ${innerHeight - b}px ${l}px)`;
}

/* one corner; the other three are mirrors of it */
const SVG = 'http://www.w3.org/2000/svg';
function corner(arm, key) {
  const h = STROKE / 2, n = arm + STROKE, r = RADIUS;
  const svg = document.createElementNS(SVG, 'svg');
  for (const [k, v] of [['width', n], ['height', n], ['viewBox', `0 0 ${n} ${n}`]]) svg.setAttribute(k, v);
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', `M${arm + h} ${h}H${r + h}A${r} ${r} 0 0 0 ${h} ${r + h}V${arm + h}`);
  for (const [k, v] of [['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', STROKE], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round']]) path.setAttribute(k, v);
  svg.append(path);
  const i = document.createElement('i');
  i.className = `brk-c brk-${key}`;
  i.append(svg);
  return i;
}
function paint(b, arm, color) {
  if (b.arm !== arm) { b.arm = arm; b.box.replaceChildren(...['tl', 'tr', 'bl', 'br'].map((k) => corner(arm, k))); }
  b.box.style.color = color;
}

/* ---------- gliding brackets: one per area, fixed to the viewport ---------- */
const gliders = new Map(); // area -> bracket

function gliderFor(area, host) {
  let b = gliders.get(area);
  if (b && b.wrap.isConnected) return b;
  const wrap = document.createElement('div');
  wrap.className = 'brk-wrap';
  wrap.setAttribute('aria-hidden', 'true');
  const box = document.createElement('div');
  box.className = 'brk';
  wrap.append(box);
  host.append(wrap);
  b = { area, host, wrap, box, target: null, shown: false, arm: 0, anim: null, hideTimer: 0, goal: null };
  gliders.set(area, b);
  return b;
}
const at = (f) => ({ transform: `translate(${f.x}px, ${f.y}px)`, width: `${f.w}px`, height: `${f.h}px` });
function place(b, f) { Object.assign(b.box.style, at(f)); }

function glideTo(el) {
  const area = el.closest(AREAS) || el.parentElement;
  const host = el.closest('dialog[open]') || document.body;
  const b = gliderFor(area, host);
  clearTimeout(b.hideTimer);
  if (b.target === el && b.shown) return;
  const f = frameOf(el);
  b.wrap.style.clipPath = clipOf(el, host);
  paint(b, f.arm, f.color);
  halt(b);
  if (reduce.matches) {
    place(b, f);
    b.anim = b.shown ? null : animate(b.box, { opacity: [0, 1] }, fade());
  } else if (!b.shown) {
    place(b, { ...f, x: f.x - CONVERGE, y: f.y - CONVERGE, w: f.w + 2 * CONVERGE, h: f.h + 2 * CONVERGE });
    b.box.style.opacity = '0';
    b.anim = animate(b.box, { ...at(f), opacity: 1 }, springy());
  } else {
    b.anim = animate(b.box, { ...at(f), opacity: 1 }, springy());
  }
  b.target = el;
  b.goal = f;
  b.shown = true;
  follow();
}

/* ---------- in-place brackets: inside the target, so they share its transform ---------- */
const inPlace = new Map(); // element -> bracket

function inPlaceFor(el) {
  let b = inPlace.get(el);
  if (b && b.box.isConnected) return b;
  const box = document.createElement('span');
  box.className = 'brk brk-in';
  box.setAttribute('aria-hidden', 'true');
  el.append(box);
  b = { el, box, shown: false, arm: 0, anim: null, hideTimer: 0 };
  inPlace.set(el, b);
  return b;
}
function settleIn(el) {
  const b = inPlaceFor(el);
  clearTimeout(b.hideTimer);
  if (b.shown) return;
  const o = outset(el);
  paint(b, armFor(el.offsetWidth + 2 * o.x, el.offsetHeight + 2 * o.y), colorOf(el));
  const edge = (d) => ({ top: `${-o.y - d}px`, bottom: `${-o.y - d}px`, left: `${-o.x - d}px`, right: `${-o.x - d}px` });
  halt(b);
  if (reduce.matches) {
    Object.assign(b.box.style, edge(0));
    b.anim = animate(b.box, { opacity: [0, 1] }, fade());
  } else {
    Object.assign(b.box.style, edge(CONVERGE), { opacity: '0' });
    b.anim = animate(b.box, { ...edge(0), opacity: 1 }, springy());
  }
  b.shown = true;
}

/* ---------- show / hide ---------- */
function hideBracket(b, now = false) {
  clearTimeout(b.hideTimer);
  const go = () => {
    if (!b.shown) return;
    b.shown = false;
    b.target = null;
    halt(b);
    b.anim = animate(b.box, { opacity: 0 }, fade());
  };
  if (now) go(); else b.hideTimer = setTimeout(go, 90);
}
const all = () => [...gliders.values(), ...inPlace.values()];
function hideAllBut(keep) {
  for (const b of all()) if (b !== keep && b.shown) hideBracket(b, true);
}
function show(el) {
  if (el.closest('[inert]')) return;
  if (el.matches(IN_PLACE)) {
    hideAllBut(inPlace.get(el));
    settleIn(el);
  } else {
    hideAllBut(gliders.get(el.closest(AREAS) || el.parentElement));
    glideTo(el);
  }
}
const bracketOf = (el) => inPlace.get(el) || [...gliders.values()].find((b) => b.target === el);

/* gliding brackets follow their target live while shown (the detail view scrolling under the rail) */
let followFrame = 0;
function follow() {
  if (followFrame) return;
  const tick = () => {
    followFrame = 0;
    let any = false;
    for (const b of gliders.values()) {
      if (!b.shown || !b.target) continue;
      any = true;
      if (!b.target.isConnected || b.target.closest('[inert]') || !b.target.getClientRects().length) { hideBracket(b, true); continue; }
      const f = frameOf(b.target);
      const g = b.goal;
      b.wrap.style.clipPath = clipOf(b.target, b.host);
      const moved = Math.abs(f.x - g.x) + Math.abs(f.y - g.y) + Math.abs(f.w - g.w) + Math.abs(f.h - g.h);
      if (moved < 0.5) continue;
      b.goal = f;
      if (b.anim && b.anim.state === 'running') { halt(b); b.anim = animate(b.box, { ...at(f), opacity: 1 }, springy()); }
      else place(b, f);
    }
    if (any) followFrame = requestAnimationFrame(tick);
  };
  followFrame = requestAnimationFrame(tick);
}

/* ---------- inputs ---------- */
let hovered = null;
document.addEventListener('pointerover', (e) => {
  if (e.pointerType === 'touch') return;
  const el = e.target.closest?.('.cb');
  if (!el || el === hovered) return;
  hovered = el;
  show(el);
});
document.addEventListener('pointerout', (e) => {
  if (e.pointerType === 'touch' || !hovered) return;
  if (e.relatedTarget && hovered.contains(e.relatedTarget)) return;
  const left = hovered;
  hovered = null;
  if (e.relatedTarget?.closest?.('.cb')) return; // the next target's pointerover takes over from here
  const b = bracketOf(left);
  if (!b) return;
  const f = document.activeElement;
  if (f?.matches?.('.cb:focus-visible')) { clearTimeout(b.hideTimer); b.hideTimer = setTimeout(() => show(f), 90); }
  else hideBracket(b);
});
document.addEventListener('focusin', (e) => {
  const el = e.target.closest?.('.cb');
  if (el && el.matches(':focus-visible') && !hovered) show(el);
});
document.addEventListener('focusout', () => {
  setTimeout(() => {
    if (hovered || document.activeElement?.matches?.('.cb:focus-visible')) return;
    for (const b of all()) if (b.shown) hideBracket(b);
  });
});

root.classList.add('brk-on'); // the CSS fallback marks step aside only once this script runs
