import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

/* The build reads the files Keystatic writes (ADR-0003); keystatic.config.ts describes the same
   fields for the admin UI, and the two must change together.

   projects: one YAML file per project. The entry id is the file name, so project-1.yaml ->
   "project-1", which is what /works/<id> is built from (FR-14). Images are relative paths that
   image() resolves to src/assets, so Astro optimises them at build time (ADR-0007).

   intro: the intro copy in both languages (one file, src/content/intro.yaml).

   The `astro:content` and `astro/loaders` imports are Astro virtual modules. They need
   moduleResolution "bundler" plus the generated .astro/types.d.ts (created by `astro sync`,
   which `astro dev` and `astro build` both run). */
const bilingual = z.object({ en: z.string(), de: z.string() });
const optionalBilingual = z.object({ en: z.string().default(''), de: z.string().default('') }).default({ en: '', de: '' });

const localized = z.object({
  headline: z.string(), // short headline, CR-01
  title: z.string(),
  year: z.string(),
  tags: z.array(z.string()),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/projects' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      order: z.number(), // FR-11: the owner sets the track order
      draft: z.boolean().default(false), // FR-40: drafts stay off the public site
      thumbnail: image().nullable().optional(),
      thumbnailAlt: optionalBilingual,
      en: localized,
      de: localized, // FR-22: every published project has EN and DE content
      blocks: z
        .array(
          z.discriminatedUnion('discriminant', [
            z.object({ discriminant: z.literal('text'), value: bilingual }),
            z.object({
              discriminant: z.literal('heading'),
              value: z.object({ level: z.enum(['section', 'subsection']), text: bilingual }),
            }),
            z.object({
              discriminant: z.literal('facts'),
              value: z.object({ rows: z.array(z.object({ label: bilingual, value: bilingual })) }),
            }),
            z.object({
              discriminant: z.literal('list'),
              value: z.object({ ordered: z.boolean(), items: z.array(bilingual) }),
            }),
            z.object({
              discriminant: z.literal('image'),
              value: z.object({ image: image(), alt: bilingual, caption: optionalBilingual }),
            }),
            z.object({
              discriminant: z.literal('video'),
              value: z.object({
                url: z.string(),
                poster: image(),
                width: z.number().int().positive(),
                height: z.number().int().positive(),
                caption: optionalBilingual,
              }),
            }),
            z.object({
              discriminant: z.literal('preview'),
              value: z.object({ slug: z.string(), aspect: z.string(), title: bilingual }),
            }),
          ]),
        )
        .default([]), // FR-17: the detail view shows these in the owner's order (FR-42)
    }),
});

const introLang = z.object({
  about: z.string(),
  statement: z.string(), // markup: {Name} for the name, [word] or [word|delay|duration] for highlighter strokes
  p2: z.string(),
  p3: z.string(),
  p4: z.string(),
  trigger: z.string(),
});

const intro = defineCollection({
  loader: glob({ pattern: 'intro.yaml', base: './src/content' }),
  schema: z.object({ en: introLang, de: introLang }),
});

export const collections = { projects, intro };
