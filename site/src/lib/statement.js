/* The intro statement's markup (Keystatic "Intro" singleton) -> the parts renderStatement() and
   Intro.astro draw (owner note 3):
     {Oluwafemi Bamigboye}      the name, set in the second font
     [developer]                a highlighter stroke with the default stagger
     [developer|520|900]        a stroke with an explicit delay and duration in ms
     &shy;                      a soft hyphen, so long words can break (owner note 4)
   Default stagger: stroke i starts at 200 + 320*i ms and runs 650 + 250*i ms, so every stroke starts
   later and ends later than the one before and the last one ends last. Anything that is not a
   well-formed token stays plain text, so a typo in the CMS never breaks the page. */
const SHY = /&shy;/g;
const TOKEN = /\{([^{}]+)\}|\[([^\[\]|]+)(?:\|(\d+)\|(\d+))?\]/g;

export const strokeTiming = (i) => ({ delay: 200 + 320 * i, dur: 650 + 250 * i });

export function parseStatement(markup) {
  const src = String(markup ?? '');
  const parts = [];
  let last = 0, stroke = 0;
  const text = (s) => { if (s) parts.push({ t: s.replace(SHY, '\u00AD') }); };
  for (const m of src.matchAll(TOKEN)) {
    text(src.slice(last, m.index));
    if (m[1] != null) parts.push({ name: m[1].replace(SHY, '\u00AD') });
    else {
      const timing = m[3] != null ? { delay: Number(m[3]), dur: Number(m[4]) } : strokeTiming(stroke);
      parts.push({ hl: m[2].replace(SHY, '\u00AD'), ...timing });
      stroke++;
    }
    last = m.index + m[0].length;
  }
  text(src.slice(last));
  return parts;
}

/* Intro entry ({ en, de } with the markup string) -> the copy keys ui.js used to hold. */
export const introCopy = (intro) =>
  Object.fromEntries(['en', 'de'].map((lang) => [lang, { ...intro[lang], statement: parseStatement(intro[lang].statement) }]));
