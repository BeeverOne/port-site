# portfolio-site — Astro build

Astro port of `../docs/v2/portfolio-prototype-v2.html`, the owner-approved v2 reference
(WP1 of `../docs/v2-feedback/PORT-PLAN.md`). The v1 port remains in git at commit `855d989`.
The build is intended to be indistinguishable from the prototype; everything below exists to keep it that way.

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
| `src/styles/global.css` | The v2 prototype's `<style>` block, byte-identical. Edit here, not in a component. |
| `src/scripts/site.js` | The v2 prototype's `<script>`, byte-identical except the four standing edits listed below. |
| `src/i18n/ui.js` | The v2 EN/DE dictionary, lifted out verbatim (statement parts carry the highlighter timing). |
| `src/components/marks/` | The inline SVG brand marks, sliced out verbatim. `VStack` is parameterised: the header mark and the loader's base/fillmark pair. `R1Mark` retired with the title blocks (CR-08). |
| `src/content/projects/` | One markdown file per project (the content model; a CMS replaces this loader later). |
| `src/components/` | One component per prototype region: loader, header, intro, works, detail, contact. `TitleBlock` retired with CR-08. |
| `scripts/verify.mjs` | Asserts the build still matches the prototype (DOM hooks, CSS selectors, skeleton). |
| `scripts/interact.mjs` | Drives the built site in Chrome: transition, scroll-jack, detail, i18n, theme, contact. |

## The four standing edits to `site.js` (v1 and v2 ports alike)

1. `const T = {...}` moved to `src/i18n/ui.js` and imported.
2. `const PROJECTS = [...]` replaced by a read of the `#projects-data` JSON island,
   which `src/pages/index.astro` generates from the content collection (FR-10, FR-11, FR-22).
3. `renderCards()` (which built the cards client-side) replaced by `localizeCards()`,
   because Astro now server-renders the cards; the function only writes the active language.
4. The three prototype control-panel elements are read with `?.`, because the panel is
   dev-only (`import.meta.env.DEV`) and the prototype marks it "not part of the site".

Plus one behaviour-preserving substitution: the forced reflow in `openDetail()` uses
`getBoundingClientRect()` instead of a bare `offsetHeight;` expression. And one ordering rule:
`applyLang()` calls `localizeCards()` before the `layout()` it schedules, or the runway is measured
against the previous language's text lengths.

## Retired by the v2 port

The v1 drawing-sheet frame, the owner-directed `.frame-blur` band, the title blocks, `body.lock` and
the v1 mode state machine are all gone: the islands layout (CR-09), the title-block removal (CR-08)
and the scroll-driven transition (CR-02) replace them. The v1 port remains in git at `855d989`.

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
