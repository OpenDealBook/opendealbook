import { describe, expect, it } from 'vitest';

import {
  clientTransitionSchema,
  updateClientTransitionStepSchema,
} from './client-transition.schema';

const account_id = '11111111-1111-4111-8111-111111111111';
const deal_id = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';

describe('clientTransitionSchema', () => {
  it('accepts a plan with account, deal and client name', () => {
    expect(
      clientTransitionSchema.safeParse({ account_id, deal_id, client_name: 'Acme LLC' })
        .success,
    ).toBe(true);
  });

  it('rejects a blank client name', () => {
    expect(
      clientTransitionSchema.safeParse({ account_id, deal_id, client_name: '' }).success,
    ).toBe(false);
  });
});

describe('updateClientTransitionStepSchema', () => {
  it('accepts a known step and status', () => {
    expect(
      updateClientTransitionStepSchema.safeParse({
        id,
        step: 'consent_7216',
        status: 'requested',
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown step', () => {
    expect(
      updateClientTransitionStepSchema.safeParse({
        id,
        step: 'unknown_step',
        status: 'requested',
      }).success,
    ).toBe(false);
  });
});
