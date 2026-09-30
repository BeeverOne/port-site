import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/* One entry per project. The entry id is the file name, so project-1.md -> "project-1",
   which is what the works-track URLs (#/works/project-1) are built from (FR-14).
   A CMS replaces this loader later; the field shape is the content model (FR-10, CR-01, FR-22).

   The `astro:content` and `astro/loaders` imports are Astro virtual modules. They need
   moduleResolution "bundler" plus the generated .astro/types.d.ts (created by `astro sync`,
   which `astro dev` and `astro build` both run). */
const localized = z.object({
  headline: z.string(), // short headline, CR-01
  title: z.string(),
  year: z.string(),
  tags: z.array(z.string()),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    order: z.number(), // FR-11: the owner sets the track order
    draft: z.boolean().default(false), // FR-40: drafts stay off the public site
    en: localized,
    de: localized, // FR-22: every published project has EN and DE content
  }),
});

export const collections = { projects };
