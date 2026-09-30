import { defineConfig } from 'astro/config';

// FR-46: served at https://reverb-one.space
export default defineConfig({
  site: 'https://reverb-one.space',
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
