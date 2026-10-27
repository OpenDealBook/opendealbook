import { describe, expect, it } from 'vitest';

import { maskTerms, nameTerms, redactPeople } from './redact';

describe('redactPeople', () => {
  it('removes emails, phone numbers and the named people, case-insensitively', () => {
    const text =
      'Call Dana Whitfield at (555) 201-3344 or +1 555.201.9988, email dana.w@example-firm.com. dana whitfield owns it.';

    expect(redactPeople(text, ['Dana Whitfield'])).toBe(
      'Call [name] at [phone] or [phone], email [email]. [name] owns it.',
    );
  });

  it('removes each first and last name of three or more letters as whole words', () => {
    const text = 'Dana said Whitfield agreed; Danash and Whitfields are other people. Al Bo and Al left.';

    expect(redactPeople(text, ['Dana Whitfield', 'Al Bo'])).toBe(
      '[name] said [name] agreed; Danash and Whitfields are other people. [name] and Al left.',
    );
  });

  it('prefers the longest known name', () => {
    expect(redactPeople('Ann Marie Lee and Ann met', ['Ann Lee', 'Ann Marie Lee'])).toBe(
      '[name] and [name] met',
    );
  });

  it('matches names with accents and hyphens as whole words', () => {
    expect(redactPeople('Ask José Brennan-Fisk or brennan-fisk.', ['José Brennan-Fisk'])).toBe(
      'Ask [name] or [name].',
    );
  });

  it('removes unformatted, international and extension phone numbers', () => {
    const text =
      'Cell 5552013344, UK +44 20 7946 0958, desk 555-201-3344 ext. 204, office (555) 201-3344 x12, +15552013344.';

    expect(redactPeople(text, [])).toBe(
      'Cell [phone], UK [phone], desk [phone], office [phone], [phone].',
    );
  });

  it('leaves revenue figures, years, EINs and counts alone', () => {
    const text =
      'Revenue $2500000000 or $2,500,000,000, SDE 1,250,000, 4200000 in 2024, EIN 12-3456789, 42 staff, 2500000000.50 total.';

    expect(redactPeople(text, [])).toBe(text);
  });

  it('treats a name as literal text, not a pattern', () => {
    expect(redactPeople('Mr. O.K. (Jr) said hi; MrXOXK said no', ['Mr. O.K. (Jr)'])).toBe(
      '[name] said hi; MrXOXK said no',
    );
  });
});

describe('nameTerms', () => {
  it('can keep every part of a name, however short', () => {
    expect(nameTerms(['Wei Li'], 1)).toEqual(['Wei Li', 'Wei', 'Li']);
  });
});

describe('maskTerms', () => {
  const mask = (text: string, ...terms: string[]) => maskTerms(text, terms.map((term) => ({ term, mask: '[S]' })));

  it('matches across case, accents, curly quotes and punctuation', () => {
    expect(mask('JOSÉ and Jose met José', 'José')).toBe('[S] and [S] met [S]');
    expect(mask('Ask O’Brien or OBRIEN', "O'Brien")).toBe('Ask [S] or [S]');
    expect(mask('St Marys Clinic and St. Mary’s', "St. Mary's")).toBe('[S] Clinic and [S]');
  });

  it('reads & as and, and Bros as Brothers', () => {
    expect(mask('Smith and Sons sued Smith & Sons', 'Smith & Sons')).toBe('[S] sued [S]');
    expect(mask('Smith Brothers, Smith Bros.', 'Smith Bros')).toBe('[S], [S]');
  });

  it('masks a short surname only as a whole word', () => {
    expect(mask('Li and Lin met Li.', 'Li')).toBe('[S] and Lin met [S]');
  });

  it('ignores legal forms and prefers the longest term', () => {
    expect(mask('Rowan Plumbing, Inc. and Rowan', 'Rowan Plumbing LLC', 'Rowan')).toBe('[S], Inc. and [S]');
  });
});
