import { describe, expect, it } from 'vitest';

import { registryLocation } from './registry-location';

const blank = {
  principal_address_line1: null,
  principal_city: null,
  principal_state: null,
  principal_postal_code: null,
  mailing_city: null,
  mailing_state: null,
};

describe('registryLocation', () => {
  it('uses the principal city and state of an entity with only a principal address', () => {
    expect(
      registryLocation({
        ...blank,
        principal_address_line1: '12 Sample Ave',
        principal_city: 'Denver',
        principal_state: 'CO',
        principal_postal_code: '80202',
      }),
    ).toEqual({ city: 'Denver', state: 'CO' });
  });

  it('falls back to the mailing city and state when the principal address is empty', () => {
    expect(
      registryLocation({
        ...blank,
        mailing_city: 'Bend',
        mailing_state: 'OR',
      }),
    ).toEqual({ city: 'Bend', state: 'OR' });
  });

  it('keeps a partial principal address whole instead of filling gaps from the mailing address', () => {
    expect(
      registryLocation({
        ...blank,
        principal_address_line1: '12 Sample Ave',
        mailing_city: 'Boulder',
        mailing_state: 'CO',
      }),
    ).toEqual({ city: null, state: null });
  });
});
