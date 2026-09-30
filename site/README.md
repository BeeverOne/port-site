# portfolio-site — Astro build

Astro port of `../base/portfolio-prototype.html`, the owner-approved reference
implementation for portfolio-site v1. The build is intended to be indistinguishable
from the prototype; everything below exists to keep it that way.

## Run

```sh
npm install
npm run dev        # http://localhost:4321 (includes the prototype control panel)
npm run build      # static output in dist/
npm run preview    # serve dist/ on :4322
npm run verify     # build + faithfulness checks against the prototype
npm run test:e2e   # browser smoke test of the interactive flows (needs Chrome)
```

## Layout

| Path | What it is |
| --- | --- |
| `src/styles/global.css` | The prototype's `<style>` block verbatim, plus the owner-directed `.frame-blur` addition. Edit here, not in a component. |
| `src/scripts/site.js` | The prototype's `<script>`, byte-identical except the four edits listed below. |
| `src/i18n/ui.js` | The prototype's EN/DE dictionary, lifted out verbatim. |
| `src/components/marks/` | The three inline SVG brand marks, sliced out verbatim. |
| `src/content/projects/` | One markdown file per project (the content model; a CMS replaces this loader later). |
| `src/components/` | One component per prototype region: loader, header, intro, works, detail, contact. |
| `scripts/verify.mjs` | Asserts the build still matches the prototype (DOM hooks, CSS selectors, skeleton). |
| `scripts/interact.mjs` | Drives the built site in Chrome: transition, scroll-jack, detail, i18n, theme, contact. |

## The four deliberate edits to `site.js`

1. `const T = {...}` moved to `src/i18n/ui.js` and imported.
2. `const PROJECTS = [...]` replaced by a read of the `#projects-data` JSON island,
   which `src/pages/index.astro` generates from the content collection (FR-10, FR-11, FR-22).
3. `renderCards()` (which built the cards client-side) replaced by `localizeCards()`,
   because Astro now server-renders the cards; the function only writes the active language.
4. The three prototype control-panel elements are read with `?.`, because the panel is
   dev-only (`import.meta.env.DEV`) and the prototype marks it "not part of the site".

Plus one behaviour-preserving substitution: the forced reflow in `openDetail()` uses
`getBoundingClientRect()` instead of a bare `offsetHeight;` expression.

## Owner-directed design additions

- `.frame-blur` (in `global.css` + one element in `src/pages/index.astro`): the frame frames the
  site by sitting over the content, so the whole sheet margin outside the 1px border blurs at
  full strength - 16px, stronger than the bottom-edge blur's 7px, with no fade. Content that
  scrolls under the frame reads as frosted glass behind it; the 1px border paints above and
  stays crisp.

## One deliberate build-config deviation

`astro.config.mjs` sets `vite.build.cssMinify: 'esbuild'` instead of Astro's default
Lightning CSS. Lightning dedupes the `backdrop-filter` / `-webkit-backdrop-filter` alias
pair down to the last declaration, and the prototype lists the standard property first —
so the minified stylesheet kept only the alias, which Chrome computes as `none`, and the
bottom-edge blur silently vanished. esbuild minifies without that alias-dedup, so the
stylesheet keeps both declarations exactly as the prototype wrote them.

## Not in this pass (same exclusions as the prototype)

CMS admin, real mail delivery, real Cloudflare Turnstile, server-side sanitizing and rate
limit, media loaders with real media (FR-50, FR-51), and legal page content. The contact
form validates client-side and simulates sending, exactly as the prototype does.
