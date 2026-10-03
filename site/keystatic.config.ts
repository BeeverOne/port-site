/* Keystatic CMS (ADR-0003). The owner edits projects at /keystatic: card fields in English and German,
   a thumbnail, the track order, a draft flag, and the detail view's blocks (text, heading, facts, list,
   image, video, preview) in the owner's order
   (FR-10, FR-11, FR-17, FR-22, FR-38 to FR-42). Each project is one YAML file in
   src/content/projects; the file name is the project id in /works/<id> (FR-14).

   Storage: GitHub mode in production builds, so a save is a commit that starts a Vercel deployment
   (FR-43, NFR-10); local files in development. PUBLIC_KEYSTATIC_STORAGE=github forces GitHub mode locally,
   which the one-time GitHub App setup needs.

   The intro copy (about label, statement, paragraphs, trigger heading) is a singleton in
   src/content/intro.yaml (CR-27).

   src/content.config.ts reads the same files at build time and must describe the same fields. */
import { collection, config, fields, singleton } from '@keystatic/core';

// PUBLIC_: this config runs in the admin UI in the browser too, and both halves must agree on the mode
const github = import.meta.env.PROD || import.meta.env.PUBLIC_KEYSTATIC_STORAGE === 'github';

/* Text in both languages: FR-22 requires every published project to be complete in EN and DE. */
const bilingual = (label: string, { multiline = false, required = true } = {}) =>
  fields.object(
    {
      en: fields.text({ label: `${label} (EN)`, multiline, validation: { isRequired: required } }),
      de: fields.text({ label: `${label} (DE)`, multiline, validation: { isRequired: required } }),
    },
    { label },
  );

/* Images live in the repository and are optimised by Astro at build time (ADR-0007). The public path
   is relative to the project's YAML file, so Astro's image() helper resolves it to src/assets. */
const image = (label: string, required = false) =>
  fields.image({
    label,
    directory: 'src/assets/projects',
    publicPath: '../../assets/projects/',
    validation: { isRequired: required },
  });

/* Interactive component previews are small pages in src/pages/previews (ADR-0008); the CMS picks one. */
const PREVIEWS = [{ label: 'Circle size (demo)', value: 'circle-size' }] as const;

const cardFields = (lang: 'EN' | 'DE') =>
  fields.object(
    {
      headline: fields.text({ label: `Short headline (${lang})`, validation: { isRequired: true } }),
      title: fields.text({ label: `Title (${lang})`, validation: { isRequired: true } }),
      year: fields.text({ label: `Year (${lang})`, validation: { isRequired: true } }),
      tags: fields.array(fields.text({ label: 'Tag', validation: { isRequired: true } }), {
        label: `Tags (${lang})`,
        itemLabel: (props) => props.value || 'Tag',
      }),
    },
    { label: lang === 'EN' ? 'Card, English' : 'Card, German' },
  );

/* The intro copy in one language (singleton "Intro", CR-27). */
const introFields = (L: 'EN' | 'DE') =>
  fields.object(
    {
      about: fields.text({ label: `Section label (${L})`, validation: { isRequired: true } }),
      statement: fields.text({
        label: `Statement (${L})`,
        multiline: true,
        description:
          '{Name} sets the name in the second font. [word] adds a highlighter stroke; each later stroke starts and ends later. ' +
          '[word|delay|duration] sets the timing in ms. &shy; marks where a long word may break.',
        validation: { isRequired: true },
      }),
      p2: fields.text({ label: `Paragraph 1 (${L})`, multiline: true, validation: { isRequired: true } }),
      p3: fields.text({ label: `Paragraph 2, next to the [ AI ] note (${L})`, multiline: true, validation: { isRequired: true } }),
      p4: fields.text({ label: `Paragraph 3 (${L})`, multiline: true, validation: { isRequired: true } }),
      trigger: fields.text({ label: `Heading before the works (${L})`, validation: { isRequired: true } }),
    },
    { label: L === 'EN' ? 'English' : 'German' },
  );

export default config({
  // The site lives in site/ inside the repository. Local mode resolves paths from site/ (the dev server's
  // folder); GitHub mode resolves them from the repository root, so it needs the prefix or it finds no
  // content at all (the admin showed empty forms). pathPrefix applies to GitHub mode only.
  storage: github ? { kind: 'github', repo: 'BeeverOne/port-site', pathPrefix: 'site' } : { kind: 'local' },
  ui: { brand: { name: 're.verb one' } },
  singletons: {
    intro: singleton({
      label: 'Intro',
      path: 'src/content/intro',
      format: { data: 'yaml' },
      schema: { en: introFields('EN'), de: introFields('DE') },
    }),
  },
  collections: {
    projects: collection({
      label: 'Projects',
      slugField: 'name',
      path: 'src/content/projects/*',
      format: { data: 'yaml' },
      columns: ['name', 'order', 'draft'],
      schema: {
        name: fields.slug({
          name: { label: 'Project name (admin only)', validation: { isRequired: true } },
          slug: { label: 'Project id in the URL', description: 'Becomes /works/<id>. Changing it breaks shared links.' },
        }),
        order: fields.integer({
          label: 'Position in the works track',
          description: 'Lower numbers come first (FR-11).',
          defaultValue: 1,
          validation: { isRequired: true, min: 1 },
        }),
        draft: fields.checkbox({
          label: 'Draft',
          description: 'Drafts show on preview deployments and in development, never on reverb-one.space (FR-40).',
          defaultValue: true,
        }),
        thumbnail: image('Card thumbnail'),
        thumbnailAlt: bilingual('Thumbnail alt text', { required: false }),
        en: cardFields('EN'),
        de: cardFields('DE'),
        blocks: fields.blocks(
          {
            text: {
              label: 'Text',
              itemLabel: (props) => props.fields.en.value.slice(0, 48) || 'Text',
              schema: bilingual('Text', { multiline: true }),
            },
            heading: {
              label: 'Heading',
              itemLabel: (props) => props.fields.text.fields.en.value || 'Heading',
              schema: fields.object({
                level: fields.select({
                  label: 'Level',
                  options: [
                    { label: 'Section', value: 'section' },
                    { label: 'Subsection', value: 'subsection' },
                  ],
                  defaultValue: 'section',
                }),
                text: bilingual('Heading'),
              }),
            },
            facts: {
              label: 'Facts',
              itemLabel: (props) => `Facts (${props.fields.rows.elements.length} rows)`,
              schema: fields.object({
                rows: fields.array(fields.object({ label: bilingual('Label'), value: bilingual('Value') }), {
                  label: 'Rows',
                  itemLabel: (props) => props.fields.label.fields.en.value || 'Row',
                }),
              }),
            },
            list: {
              label: 'List',
              itemLabel: (props) => props.fields.items.elements[0]?.fields.en.value.slice(0, 48) || 'List',
              schema: fields.object({
                ordered: fields.checkbox({ label: 'Numbered', defaultValue: false }),
                items: fields.array(bilingual('Item'), {
                  label: 'Items',
                  itemLabel: (props) => props.fields.en.value || 'Item',
                }),
              }),
            },
            image: {
              label: 'Image',
              itemLabel: (props) => props.fields.alt.fields.en.value || 'Image',
              schema: fields.object({
                image: image('Image', true),
                alt: bilingual('Alt text'),
                caption: bilingual('Caption', { required: false }),
              }),
            },
            video: {
              label: 'Video',
              itemLabel: (props) => props.fields.caption.fields.en.value || 'Video',
              schema: fields.object({
                url: fields.url({ label: 'Video URL (Vercel Blob)', validation: { isRequired: true } }),
                poster: image('Poster image (shown before the video loads)', true),
                width: fields.integer({ label: 'Width (px)', validation: { isRequired: true, min: 1 } }),
                height: fields.integer({ label: 'Height (px)', validation: { isRequired: true, min: 1 } }),
                caption: bilingual('Caption', { required: false }),
              }),
            },
            preview: {
              label: 'Interactive preview',
              itemLabel: (props) => props.fields.title.fields.en.value || 'Interactive preview',
              schema: fields.object({
                slug: fields.select({ label: 'Preview', options: PREVIEWS, defaultValue: 'circle-size' }),
                aspect: fields.text({
                  label: 'Aspect ratio',
                  description: 'Width / height, for example 16 / 9. Reserves the frame before it loads (FR-50).',
                  defaultValue: '16 / 9',
                  validation: { isRequired: true, pattern: { regex: /^\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?$/, message: 'Use the form 16 / 9' } },
                }),
                title: bilingual('Title'),
              }),
            },
          },
          { label: 'Detail blocks', description: 'Shown in this order in the project detail view (FR-17, FR-42).' },
        ),
      },
    }),
  },
});
