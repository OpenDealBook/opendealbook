import { describe, expect, it } from 'vitest';

import { maskTerms, nameTerms } from './redact';

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
