/* Unit tests for the contact endpoint logic (src/lib/contact.js): FT-29, FT-30, FT-31, FT-32 (U part),
   FT-34 and FT-36. fetch is stubbed, so no request leaves the machine. */
import { describe, it, expect, vi } from 'vitest';
import { sanitize, checkFields, buildEmail, handleContact, LIMITS } from '../src/lib/contact.js';

const ENV = { TURNSTILE_SECRET_KEY: 'ts-secret', RESEND_API_KEY: 're_test', CONTACT_FROM: 're.verb one <contact@reverb-one.space>', CONTACT_TO: 'owner@example.com' };
const VALID = { name: 'Ada Lovelace', email: 'ada@example.com', message: 'Hello there.', lang: 'en', token: 'tok' };
const ok = (json) => ({ ok: true, status: 200, json: async () => json });
const fail = (status) => ({ ok: false, status, json: async () => ({}) });

/* A fetch stub that answers siteverify and Resend separately and records the calls. */
function stub({ verify = ok({ success: true }), send = ok({ id: 'm1' }) } = {}) {
  return vi.fn(async (url) => {
    if (String(url).includes('siteverify')) { if (verify instanceof Error) throw verify; return verify; }
    if (send instanceof Error) throw send;
    return send;
  });
}

describe('sanitize (FR-31)', () => {
  it('removes HTML tags, including script and event-handler markup', () => {
    expect(sanitize('<script>alert(1)</script>Ada')).toBe('alert(1)Ada');
    expect(sanitize('<img src=x onerror="alert(1)">Ada')).toBe('Ada');
  });
  it('turns control characters and line breaks into spaces in single-line fields (no header injection)', () => {
    expect(sanitize('Ada\r\nBcc: evil@example.com')).toBe('Ada Bcc: evil@example.com');
    expect(sanitize('A\u0000d\u0007a')).toBe('A d a');
  });
  it('keeps line breaks in the message but drops other control characters', () => {
    expect(sanitize('line 1\r\nline 2\u0007', { multiline: true })).toBe('line 1\nline 2');
  });
});

describe('checkFields (FR-28 to FR-30)', () => {
  it('accepts a complete, valid submission', () => {
    expect(checkFields(VALID).fields).toEqual([]);
  });
  it('names every missing or invalid field', () => {
    expect(checkFields({ name: ' ', email: 'no-at-sign', message: '' }).fields).toEqual(['name', 'email', 'message']);
  });
  it('rejects a message of 3,001 characters and accepts 3,000', () => {
    expect(checkFields({ ...VALID, message: 'x'.repeat(LIMITS.message + 1) }).fields).toEqual(['message']);
    expect(checkFields({ ...VALID, message: 'x'.repeat(LIMITS.message) }).fields).toEqual([]);
  });
  it('rejects a field that is only markup once sanitized', () => {
    expect(checkFields({ ...VALID, name: '<b></b>' }).fields).toEqual(['name']);
  });
  it('treats a non-object body as empty', () => {
    expect(checkFields(null).fields).toEqual(['name', 'email', 'message']);
  });
});

describe('buildEmail (FR-34, FR-35)', () => {
  it('sends plain text to the owner with reply_to set to the visitor', () => {
    const mail = buildEmail({ name: 'Ada', email: 'ada@example.com', message: 'Hi', lang: 'de' }, { from: ENV.CONTACT_FROM, to: ENV.CONTACT_TO });
    expect(mail).toEqual({
      from: ENV.CONTACT_FROM, to: ['owner@example.com'], reply_to: 'ada@example.com',
      subject: 'Contact form: Ada', text: 'Name: Ada\nEmail: ada@example.com\nLanguage: de\n\nHi\n',
    });
    expect(mail).not.toHaveProperty('html');
  });
});

describe('handleContact', () => {
  it('200: verifies the token, then sends exactly one mail', async () => {
    const f = stub();
    const res = await handleContact({ body: VALID, ip: '203.0.113.7', env: ENV, fetch: f });
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(f).toHaveBeenCalledTimes(2);
    const verifyBody = f.mock.calls[0][1].body;
    expect(verifyBody.get('secret')).toBe('ts-secret');
    expect(verifyBody.get('response')).toBe('tok');
    expect(verifyBody.get('remoteip')).toBe('203.0.113.7');
    const send = f.mock.calls[1][1];
    expect(send.headers.Authorization).toBe('Bearer re_test');
    expect(JSON.parse(send.body).reply_to).toBe('ada@example.com');
  });
  it('400: invalid fields are rejected before Turnstile or Resend are called', async () => {
    const f = stub();
    const res = await handleContact({ body: { ...VALID, email: 'bad' }, env: ENV, fetch: f });
    expect(res).toEqual({ status: 400, body: { error: 'invalid', fields: ['email'] } });
    expect(f).not.toHaveBeenCalled();
  });
  it('403: a missing token never reaches siteverify (FR-32)', async () => {
    const f = stub();
    expect(await handleContact({ body: { ...VALID, token: '' }, env: ENV, fetch: f })).toEqual({ status: 403, body: { error: 'verification' } });
    expect(f).not.toHaveBeenCalled();
  });
  it('403: a token Turnstile rejects sends no mail (FR-32)', async () => {
    const f = stub({ verify: ok({ success: false, 'error-codes': ['invalid-input-response'] }) });
    expect(await handleContact({ body: VALID, env: ENV, fetch: f })).toEqual({ status: 403, body: { error: 'verification' } });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('403: siteverify unreachable fails closed', async () => {
    const f = stub({ verify: new Error('network') });
    expect((await handleContact({ body: VALID, env: ENV, fetch: f })).status).toBe(403);
  });
  it('502: Resend refuses or is unreachable (FR-36)', async () => {
    expect(await handleContact({ body: VALID, env: ENV, fetch: stub({ send: fail(422) }) })).toEqual({ status: 502, body: { error: 'delivery' } });
    expect((await handleContact({ body: VALID, env: ENV, fetch: stub({ send: new Error('timeout') }) })).status).toBe(502);
  });
  it('502: a missing server secret is a delivery failure, not a crash', async () => {
    const f = stub();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await handleContact({ body: VALID, env: { ...ENV, RESEND_API_KEY: undefined }, fetch: f })).status).toBe(502);
    expect(f).not.toHaveBeenCalled();
  });
});
