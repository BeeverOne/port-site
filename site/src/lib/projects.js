/* Which projects the site shows (FR-11, FR-40). Drafts appear in development and on Vercel preview
   deployments, where the owner checks them before publishing (ADR-0003); a production build never
   includes them. The page and the /works/<id> route generators share this, so they always agree. */
import { getCollection } from 'astro:content';

export const showDrafts = import.meta.env.DEV || process.env.VERCEL_ENV === 'preview';

export async function siteProjects() {
  const projects = await getCollection('projects', ({ data }) => showDrafts || !data.draft);
  return projects.sort((a, b) => a.data.order - b.data.order);
}
