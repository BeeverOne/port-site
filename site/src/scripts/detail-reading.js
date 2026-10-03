/* Reading aids for the detail view (CR-29): the contents rail, the current section in the sticky bar,
   and the reading-progress line. site.js owns opening, closing and which block set shows; this module
   only watches the result (the visible set, the open class, the scroll position), so site.js never has
   to call it. ProjectDetail.astro gives each heading an id, its contents label (data-toc) and its
   number or letter (data-n). */
const detail = document.getElementById('detail');

if (detail) {
  const toc = document.getElementById('detailToc');
  const section = document.getElementById('detailSection');
  const progress = document.getElementById('detailProgress');
  const head = detail.querySelector('.detail-head');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const LINE = 120; // a heading counts as current once it passes this far below the detail's top
  let heads = [];
  let links = [];
  let frame = 0;

  const link = (h) => {
    const a = document.createElement('a');
    a.className = 'cb';
    a.href = '#' + h.id;
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = h.dataset.n || '';
    a.append(n, h.dataset.toc || '');
    const li = document.createElement('li');
    li.append(a);
    return li;
  };

  /* Rebuild the rail from the visible set: sections at the top level, subsections under theirs. */
  function build() {
    const set = detail.querySelector('.detail-blocks:not([hidden])');
    heads = set ? [...set.querySelectorAll('.block-heading[id]')] : [];
    toc.replaceChildren();
    let sec = null;
    for (const h of heads) {
      const li = link(h);
      if (h.classList.contains('sec')) {
        toc.append(li);
        sec = li;
      } else if (sec) {
        let sub = sec.querySelector('ol');
        if (!sub) sec.append((sub = document.createElement('ol')));
        sub.append(li);
      } else toc.append(li);
    }
    links = [...toc.querySelectorAll('a')];
    detail.classList.toggle('has-toc', heads.some((h) => h.classList.contains('sec')));
    update();
  }

  function update() {
    frame = 0;
    const max = detail.scrollHeight - detail.clientHeight;
    progress.style.transform = `scaleX(${max > 0 ? Math.min(1, detail.scrollTop / max) : 0})`;
    const top = detail.getBoundingClientRect().top;
    let sec = null;
    let at = null;
    for (const h of heads) {
      if (h.getBoundingClientRect().top > top + LINE) break;
      at = h;
      if (h.classList.contains('sec')) sec = h;
    }
    section.textContent = sec ? sec.dataset.toc : '';
    detail.classList.toggle('past-head', head.getBoundingClientRect().bottom < top + 64);
    for (const a of links) {
      const id = a.hash.slice(1);
      a.classList.toggle('active', id === at?.id || id === sec?.id);
      if (id === at?.id) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    }
  }
  const queue = () => { if (!frame) frame = requestAnimationFrame(update); };

  detail.addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);

  /* In-page links (the rail, the '→ A' chips): scroll the detail itself, never the island behind it,
     then hand focus to the heading so keyboard and screen-reader users land there too. */
  detail.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const target = document.getElementById(decodeURIComponent(a.hash.slice(1)));
    if (!target || !detail.contains(target)) return;
    e.preventDefault();
    const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    const y = target.getBoundingClientRect().top - detail.getBoundingClientRect().top + detail.scrollTop - margin;
    detail.scrollTo({ top: y, behavior: reduce.matches ? 'auto' : 'smooth' });
    target.focus({ preventScroll: true });
  });

  /* site.js swaps sets on open and on a language switch (hidden), and opens and closes the view (class). */
  const watch = new MutationObserver((records) => {
    if (records.some((r) => r.attributeName === 'hidden')) build();
    else queue();
  });
  detail.querySelectorAll('.detail-blocks').forEach((s) => watch.observe(s, { attributes: true, attributeFilter: ['hidden'] }));
  watch.observe(detail, { attributes: true, attributeFilter: ['class'] });
  build();
}
