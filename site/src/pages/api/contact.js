/* POST /api/contact (interfaces.md I-10 to I-15). The only on-demand route next to the static
   pages (ADR-0001); the logic lives in src/lib/contact.js. */
import { getSecret } from 'astro:env/server';
import { handleContact } from '../../lib/contact.js';

export const prerender = false;

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });

export async function POST({ request, clientAddress }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'invalid', fields: ['name', 'email', 'message'] });
  }
  const env = {
    TURNSTILE_SECRET_KEY: getSecret('TURNSTILE_SECRET_KEY'),
    RESEND_API_KEY: getSecret('RESEND_API_KEY'),
    CONTACT_FROM: getSecret('CONTACT_FROM'),
    CONTACT_TO: getSecret('CONTACT_TO'),
  };
  let ip;
  try { ip = clientAddress; } catch { ip = undefined; }   // not every runtime exposes it
  const { status, body: out } = await handleContact({ body, ip, env, fetch });
  return json(status, out);
}

// Any other method: 405 (interfaces.md)
export const ALL = () => json(405, { error: 'method' }, { Allow: 'POST' });
