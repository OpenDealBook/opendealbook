import { describe, expect, it } from 'vitest';

import { registryAddress } from './registryAddress';

const blank = {
  principal_address_line1: null,
  principal_city: null,
  principal_state: null,
  principal_postal_code: null,
  mailing_address_line1: null,
  mailing_city: null,
  mailing_state: null,
  mailing_postal_code: null,
};

describe('registryAddress', () => {
  it('uses the principal address when the entity has one', () => {
    expect(
      registryAddress({
        ...blank,
        principal_address_line1: '12 Sample Ave',
        principal_city: 'Denver',
        principal_state: 'CO',
        principal_postal_code: '80202',
        mailing_address_line1: 'PO Box 7',
        mailing_city: 'Boulder',
        mailing_state: 'CO',
        mailing_postal_code: '80301',
      }),
    ).toEqual({
      line1: '12 Sample Ave',
      city: 'Denver',
      state: 'CO',
      postalCode: '80202',
    });
  });

  it('falls back to the mailing address when the principal address is empty', () => {
    expect(
      registryAddress({
        ...blank,
        principal_address_line1: '',
        mailing_address_line1: 'PO Box 1',
        mailing_city: 'Bend',
        mailing_state: 'OR',
        mailing_postal_code: '97701',
      }),
    ).toEqual({
      line1: 'PO Box 1',
      city: 'Bend',
      state: 'OR',
      postalCode: '97701',
    });
  });

  it('keeps a partial principal address whole instead of filling gaps from the mailing address', () => {
    expect(
      registryAddress({
        ...blank,
        principal_city: 'Denver',
        mailing_address_line1: 'PO Box 7',
        mailing_city: 'Boulder',
        mailing_state: 'CO',
        mailing_postal_code: '80301',
      }),
    ).toEqual({ line1: null, city: 'Denver', state: null, postalCode: null });
  });
});
