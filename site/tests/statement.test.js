/* Unit tests for the intro statement markup (src/lib/statement.js). */
import { describe, it, expect } from 'vitest';
import { parseStatement, strokeTiming, introCopy } from '../src/lib/statement.js';

describe('parseStatement', () => {
  it('reproduces the English statement the prototype hard-coded (default stagger 200/650, 520/900)', () => {
    expect(parseStatement('I’m {Oluwafemi Bamigboye}, a [software] [developer] with a background.')).toEqual([
      { t: 'I’m ' }, { name: 'Oluwafemi Bamigboye' }, { t: ', a ' },
      { hl: 'software', delay: 200, dur: 650 }, { t: ' ' },
      { hl: 'developer', delay: 520, dur: 900 }, { t: ' with a background.' },
    ]);
  });
  it('takes explicit timing and turns &shy; into a soft hyphen', () => {
    expect(parseStatement('[Software&shy;entwickler|200|1100] mit')).toEqual([
      { hl: 'Software\u00ADentwickler', delay: 200, dur: 1100 }, { t: ' mit' },
    ]);
  });
  it('makes every default stroke start later and end later than the one before', () => {
    const [a, b, c] = [0, 1, 2].map(strokeTiming);
    expect(b.delay).toBeGreaterThan(a.delay);
    expect(c.delay + c.dur).toBeGreaterThan(b.delay + b.dur);
  });
  it('leaves malformed tokens as plain text instead of breaking the page', () => {
    expect(parseStatement('a [broken and {open')).toEqual([{ t: 'a [broken and {open' }]);
    expect(parseStatement('x [w|12] y')).toEqual([{ t: 'x [w|12] y' }]);
    expect(parseStatement('')).toEqual([]);
    expect(parseStatement(undefined)).toEqual([]);
  });
});

describe('introCopy', () => {
  it('parses the statement for both languages and keeps the other fields', () => {
    const copy = introCopy({ en: { about: 'a', statement: '[x]', p2: '', p3: '', p4: '', trigger: 't' }, de: { about: 'b', statement: 'y', p2: '', p3: '', p4: '', trigger: 'u' } });
    expect(copy.en.statement).toEqual([{ hl: 'x', delay: 200, dur: 650 }]);
    expect(copy.de).toMatchObject({ about: 'b', trigger: 'u', statement: [{ t: 'y' }] });
  });
});
