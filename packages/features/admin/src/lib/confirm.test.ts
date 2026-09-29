import { describe, expect, it } from 'vitest';

import { nameMatchesConfirmation } from './confirm';

describe('nameMatchesConfirmation', () => {
  it('is true when the typed value equals the account name', () => {
    expect(nameMatchesConfirmation('Acme Corp', 'Acme Corp')).toBe(true);
  });

  it('trims surrounding whitespace before comparing', () => {
    expect(nameMatchesConfirmation('  Acme Corp  ', 'Acme Corp')).toBe(true);
  });

  it('is false when the typed value differs', () => {
    expect(nameMatchesConfirmation('acme', 'Acme Corp')).toBe(false);
  });

  it('is false for a blank account name so an empty input never confirms', () => {
    expect(nameMatchesConfirmation('', '')).toBe(false);
  });
});
