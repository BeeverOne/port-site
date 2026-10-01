/* Contact endpoint logic (interfaces.md "Contact endpoint", FR-28 to FR-36, ADR-0004, ADR-0005).
   Pure apart from the injected fetch, so unit tests drive every branch without the network.

   Order: field check -> Turnstile siteverify -> Resend. The field check runs first so a malformed
   request never spends a Turnstile token or reaches the mail API. */

export const LIMITS = { name: 200, email: 254, message: 3000 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;   // same rule as the client (site.js) so both agree
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const RESEND = 'https://api.resend.com/emails';
const TIMEOUT_MS = 8000;   // a stalled upstream must not hold the function open

/* FR-31: strip HTML tags and control characters. Single-line fields also lose line breaks, so a
   name can never inject a header line into the subject. The mail is sent as plain text only. */
export function sanitize(value, { multiline = false } = {}) {
  let s = String(value ?? '').replace(/\r\n?/g, '\n');
  s = s.replace(/<[^>]*>/g, '');
  s = multiline
    ? s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    : s.replace(/[\u0000-\u001F\u007F]+/g, ' ');
  return s.trim();
}

/* FR-28 to FR-30: all three fields required, valid email, message at most 3,000 characters.
   Lengths are checked on the raw input, so 3,001 characters are rejected even if sanitizing
   would shorten them. */
export function checkFields(body) {
  const raw = body && typeof body === 'object' ? body : {};
  const name = sanitize(raw.name);
  const email = sanitize(raw.email);
  const message = sanitize(raw.message, { multiline: true });
  const fields = [];
  if (!name || String(raw.name ?? '').length > LIMITS.name) fields.push('name');
  if (!EMAIL.test(email) || String(raw.email ?? '').length > LIMITS.email) fields.push('email');
  if (!message || String(raw.message ?? '').length > LIMITS.message) fields.push('message');
  const lang = raw.lang === 'de' ? 'de' : 'en';
  return { fields, data: { name, email, message, lang }, token: typeof raw.token === 'string' ? raw.token : '' };
}

export function buildEmail({ name, email, message, lang }, { from, to }) {
  return {
    from,
    to: [to],
    reply_to: email,   // Reply in the owner's inbox goes straight to the visitor
    subject: `Contact form: ${name}`,
    text: `Name: ${name}\nEmail: ${email}\nLanguage: ${lang}\n\n${message}\n`,
  };
}

const reply = (status, body) => ({ status, body });

/* Returns { status, body } for the route to serialise. env holds the four server secrets. */
export async function handleContact({ body, ip, env, fetch: doFetch }) {
  const { fields, data, token } = checkFields(body);
  if (fields.length) return reply(400, { error: 'invalid', fields });
  if (!token) return reply(403, { error: 'verification' });

  if (!env.TURNSTILE_SECRET_KEY || !env.RESEND_API_KEY || !env.CONTACT_FROM || !env.CONTACT_TO) {
    console.error('contact: a server secret is missing (TURNSTILE_SECRET_KEY, RESEND_API_KEY, CONTACT_FROM, CONTACT_TO)');
    return reply(502, { error: 'delivery' });
  }

  // FR-32: every submission needs a valid Turnstile token (ADR-0005: the only spam protection)
  let verified = false;
  try {
    const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
    if (ip) form.set('remoteip', ip);
    const res = await doFetch(SITEVERIFY, { method: 'POST', body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
    verified = res.ok && (await res.json()).success === true;
  } catch (err) {
    console.error('contact: siteverify failed', err?.name ?? err);
  }
  if (!verified) return reply(403, { error: 'verification' });

  // FR-34: deliver to the owner; FR-36: any failure answers 502 so the client keeps the text
  try {
    const res = await doFetch(RESEND, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildEmail(data, { from: env.CONTACT_FROM, to: env.CONTACT_TO })),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error('contact: Resend answered', res.status);
      return reply(502, { error: 'delivery' });
    }
  } catch (err) {
    console.error('contact: Resend request failed', err?.name ?? err);
    return reply(502, { error: 'delivery' });
  }
  return reply(200, { ok: true });
}
