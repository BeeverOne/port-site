/* Header controls follow the Contact button (CR-32): in the works section the header's Contact leaves
   the row (global.css), so the language and theme toggles move right into its space, and back left
   when the intro returns. This slides them there instead of letting them jump: it keeps each
   control's layout position, and when site.js toggles body.mode-works it plays the difference back
   with the same spring as the corner brackets. Layout positions (offsetLeft) ignore transforms, so a
   switch during a running slide starts from the right place. Reduced motion: they jump. */
import { animate } from 'motion/mini';
import { spring } from 'motion';

const controls = document.querySelector('.site-header .controls');

if (controls) {
  const movers = [...controls.querySelectorAll('.lang, .icon-btn')];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let works = document.body.classList.contains('mode-works');
  let left = new Map();
  // position in the header: the row itself is what moves (it is right-aligned), so add its offset
  const x = (el) => controls.offsetLeft + el.offsetLeft;
  const record = () => { left = new Map(movers.map((el) => [el, x(el)])); };

  new MutationObserver(() => {
    const now = document.body.classList.contains('mode-works');
    if (now === works) return;
    works = now;
    for (const el of movers) {
      const dx = (left.get(el) ?? x(el)) - x(el);
      if (Math.abs(dx) < 0.5 || reduce.matches) continue;
      animate(el, { transform: [`translateX(${dx}px)`, 'translateX(0px)'] }, { type: spring, visualDuration: 0.35, bounce: 0 });
    }
    record();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // the row also changes width with the language (Contact / Kontakt) and the viewport
  new ResizeObserver(record).observe(controls);
  record();
}
