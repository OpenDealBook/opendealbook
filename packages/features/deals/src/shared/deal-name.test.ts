import { describe, expect, it } from 'vitest';

import { dealDisplayName, outsideDealName } from './deal-name';

describe('dealDisplayName', () => {
  it('is the business name', () => {
    expect(
      dealDisplayName({ firm: { name: 'Brennan Climate Services' } }),
    ).toBe('Brennan Climate Services');
  });
});

describe('outsideDealName', () => {
  it('uses the code name when the deal has one', () => {
    expect(
      outsideDealName({
        code_name: 'Project Frost',
        firm: { name: 'Brennan Climate Services' },
      }),
    ).toBe('Project Frost');
  });

  it('uses the business name when the deal has no code name', () => {
    expect(
      outsideDealName({
        code_name: null,
        firm: { name: 'Brennan Climate Services' },
      }),
    ).toBe('Brennan Climate Services');
  });
});
