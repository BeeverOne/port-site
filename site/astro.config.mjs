import { defineConfig, envField } from 'astro/config';
import vercel from '@astrojs/vercel';

// FR-46: served at https://reverb-one.space
export default defineConfig({
  site: 'https://reverb-one.space',
  // ADR-0001: every public page stays pre-rendered (static output); only routes that opt out with
  // `export const prerender = false` (the contact endpoint, later the Keystatic admin) run as
  // Vercel functions.
  adapter: vercel(),
  env: {
    // NFR-11: secrets are read at runtime on the server through astro:env/server and never
    // inlined into a bundle. Only PUBLIC_TURNSTILE_SITE_KEY reaches the browser (it is public by
    // design). Optional so a build without them (local checks) still succeeds; the endpoint
    // answers 502 if a secret is missing at runtime.
    schema: {
      PUBLIC_TURNSTILE_SITE_KEY: envField.string({ context: 'client', access: 'public', optional: true }),
      TURNSTILE_SECRET_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      RESEND_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      CONTACT_FROM: envField.string({ context: 'server', access: 'secret', optional: true }),
      CONTACT_TO: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
  vite: {
    // Lightning CSS (Astro's default minifier) dedupes the `backdrop-filter` /
    // `-webkit-backdrop-filter` alias pair down to the last declaration, and the
    // prototype lists the standard property first - so the minified output keeps
    // only the alias, which Chrome computes as `none` and the bottom-edge blur
    // (visual-decisions.md, NFR-04) silently disappears. esbuild minifies without
    // that alias-dedup, so the stylesheet stays faithful to the prototype.
    build: { cssMinify: 'esbuild' },
  },
});
