/* The end-to-end suites run against the real projects, not fixtures: they read the YAML the CMS writes,
   so their expectations follow the owner's edits. Production builds leave drafts out, and so does this.
     PROJECTS  published projects in track order
     STUDY     the published project with the most blocks (the case study the block checks read)
     OTHER     a published project other than STUDY (direct URLs, card text, hover)
     PREVIEW   a published project with an interactive preview block, or undefined until one exists */
import { readFileSync, readdirSync } from 'node:fs';
import yaml from 'js-yaml';

const DIR = new URL('../../src/content/projects/', import.meta.url);

export const PROJECTS = readdirSync(DIR)
  .filter((f) => f.endsWith('.yaml'))
  .map((f) => ({ id: f.slice(0, -'.yaml'.length), ...yaml.load(readFileSync(new URL(f, DIR), 'utf8')) }))
  .filter((p) => !p.draft)
  .sort((a, b) => a.order - b.order);

const blockCount = (p) => p.blocks?.length ?? 0;
export const STUDY = PROJECTS.reduce((a, b) => (blockCount(b) > blockCount(a) ? b : a));
export const OTHER = PROJECTS.find((p) => p.id !== STUDY.id) ?? STUDY;
export const PREVIEW = PROJECTS.find((p) => p.blocks?.some((b) => b.discriminant === 'preview'));
