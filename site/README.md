# portfolio-site — Astro build

Astro port of `../docs/v2/portfolio-prototype-v2.html`, the owner-approved v2 reference
(WP1 of `../docs/v2-feedback/PORT-PLAN.md`). The v1 port remains in git at commit `855d989`.
The build is intended to be indistinguishable from the prototype; everything below exists to keep it that way.

## Run

```sh
npm install
npm run dev        # http://localhost:4321 (includes the prototype control panel)
npm run build      # static pages + the contact function in .vercel/output (Vercel adapter)
npm run preview    # serve .vercel/output/static on :4322 (the adapter has no `astro preview`)
npm run verify     # build + faithfulness checks against the prototype
npm test           # unit tests of the contact endpoint logic (Vitest, no network)
npm run test:e2e   # browser smoke test of the interactive flows (needs Chrome; Turnstile and /api/contact stubbed)
```

Local `.env` (git-ignored) needs `PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` set to
Cloudflare's test keys (`1x00000000000000000000AA` / `1x0000000000000000000000000000000AA`): the
real site key only allows reverb-one.space and fails on localhost with error 110200. Production
reads the real keys, `RESEND_API_KEY`, `CONTACT_FROM` and `CONTACT_TO` from the Vercel project's
environment variables at runtime (astro:env, `src/pages/api/contact.js`).

## Content and the CMS (Keystatic, ADR-0003)

The owner edits content at `/keystatic`. Two kinds of entry, both YAML in the repository:

| Entry | File | What it holds |
| --- | --- | --- |
| Projects (collection) | `src/content/projects/<id>.yaml` | Card fields in EN and DE, thumbnail and alt text, track order, draft flag, and the detail blocks (text, image, video, interactive preview) in order. `<id>` is the URL: `/works/<id>`. |
| Intro (singleton, CR-27) | `src/content/intro.yaml` | Section label, statement, three paragraphs and the heading before the works, in EN and DE. |

Images go to `src/assets/projects/<id>/` and are optimised at build time. Videos are uploaded to Vercel
Blob; the block stores the URL, a poster image and the size. Interactive previews are pages in
`src/pages/previews/<slug>/` (sandboxed iframe, ADR-0008) and need a code change plus an option in
`keystatic.config.ts`. `src/content.config.ts` must describe the same fields as `keystatic.config.ts`.

Statement markup: `{Name}` = the name in the second font, `[word]` = a highlighter stroke (each later
stroke starts and ends later), `[word|delay|duration]` = a stroke with its own timing in ms,
`&shy;` = a soft hyphen. Anything malformed stays plain text.

Drafts show in `npm run dev` and on Vercel preview deployments, never on reverb-one.space (FR-40).

Storage: `npm run dev` edits the local files. Production builds use GitHub mode: a save is a commit to
`BeeverOne/port-site`, which starts a Vercel deployment (FR-43).

### One-time GitHub App setup

1. Add `PUBLIC_KEYSTATIC_STORAGE=github` to `.env` and run `npm run dev`.
2. Open `http://127.0.0.1:4321/keystatic`, choose to create a GitHub App, enter
   `https://reverb-one.space` as the deployed URL, pick an app name, and install the app on
   `BeeverOne/port-site` only.
3. Keystatic writes `KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET`, `KEYSTATIC_SECRET`
   and `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` to `.env`. Copy all four into the Vercel project's
   environment variables (Production), then remove `PUBLIC_KEYSTATIC_STORAGE` from `.env` again.
4. If sign-in on the live site reports a redirect_uri error, add
   `https://reverb-one.space/api/keystatic/github/oauth/callback` under the app's Callback URLs
   (github.com/settings/apps/<app slug>).

## Routes (ADR-0006, ADR-0012)

`src/components/SitePage.astro` is the whole one-page site. Six routes render it, each pre-rendered
in its own language with hreflang pairs: `/`, `/works`, `/works/<id>` and the same under `/de/`.
`site.js` reads the address to decide where the view starts and moves between these URLs with the
History API (no new document). The URL sets the language; on an English URL a saved German choice,
or no choice plus a German browser, switches to German in place and moves to the `/de/` path.
Old `#/works` links are rewritten to their paths on load.

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

## Owner-directed additions on top of the v2 prototype

- Settle pause (`SETTLE_MS`, 250 ms in `src/scripts/site.js`): wheel momentum that arrives at the
  works section, or that returns the track to the first card, is absorbed for a beat before the next
  input phase takes over (the horizontal jack, or the native scroll back to the intro). Owner
  direction 2026-09-30; the v2 prototype has no pause. Horizontal trackpad input (FR-07) and reduced
  motion (FR-19) bypass it.
- Time-driven transition (CR-22): scrolling the trigger line to the top of the island starts the
  grain transition as an animation of its own; it runs on a clock, drives the view to the works
  section and suspends scrolling while it plays. Its end minus the lead starts the works flow-in,
  whose settle returns control; backward input at the first card plays it in reverse. One plus-mark
  field serves the whole island (CR-23).
- Frozen look values (owner, 2026-09-30): fade 0.45, stream 1.45, speed 2.4, scale 0.8, density 20,
  falloff 1.35, falloff width 0.7, jitter 1, min size 0.5, max size uncapped, lead 0.22, trigger
  offset 252 - baked into the LOOK object at the top of site/src/scripts/site.js.
- Single background (feel review 2): the canvas cross-fade is the island's only background; the works
  section paints none and clips the pre-flow stagger translate, which keeps the scroller height
  stable and removes both the travelling slab edge and the downward nudge.
- Card hover (CR-21): the whole card scales to 1.03 from one origin; the headline cross-fades to a
  slot above the thumbnail, siblings dim behind a works-coloured veil, and the track headroom band
  keeps the hover title clear of the track's overflow clip.
- Transition look controls: the dev-only prototype panel carries live ranges with value readouts for
  scale, density, size falloff, falloff width, randomness, min and max size, fade width, stream,
  speed, trigger lead and trigger offset (px below the island top at which the trigger line starts
  the transition), plus Copy LOOK (a paste-ready literal for site.js), Save as session defaults
  (localStorage, survives reloads) and Reset. All geometry is viewport-relative, so tuned
  values transfer across display sizes; the frozen defaults sit in the LOOK object at the top of
  site/src/scripts/site.js.
- Enter arrow nudge: the arrow below the trigger line dips 7 px on a 2.4 s loop with a hold between
  dips, signalling more content below; static under reduced motion.
- WP2 deltas (2026-10-01): scan 7 s cycle with the hover speed-up neutralised (CR-12), inert
  off-stage half of the island (CR-15), :active scale on the small controls, slider aria-valuetext
  plus Home/End and a multi-touch drag guard (CR-04, CR-11), tabular numerals on the indicator, the
  dead card radius dropped, and a linear loader fill (FR-48).
- Mobile footer collapse (CR-24): below 768 px the works footer carries an animated chevron at the
  far right of Contact; tapping it folds the GitHub/Impressum/privacy links and the copyright away
  through a grid-rows animation, and the chevron rotates 180 degrees between states. The footer
  starts collapsed on phones and one tap reveals the links (CR-25, FR-12 amended); the desktop
  footer is untouched because the wrappers dissolve with display: contents.

## Retired by the v2 port

The v1 drawing-sheet frame, the owner-directed `.frame-blur` band, the title blocks, `body.lock` and
the v1 mode state machine are all gone: the islands layout (CR-09), the title-block removal (CR-08)
and the single-scroller transition (CR-02, clock-driven since CR-22) replace them. The v1 port remains in git at `855d989`.

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
