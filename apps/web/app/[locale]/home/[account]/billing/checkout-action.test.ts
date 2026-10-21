import { describe, expect, it, vi } from 'vitest';

const billing = vi.hoisted(() => ({
  allowed: false,
  createCheckoutSession: vi.fn(async () => ({ checkoutToken: 'tok' })),
}));

vi.mock('~/config/billing-gate', () => ({ requireBilling: () => {} }));
vi.mock('@odb/stripe', () => ({ createStripeBillingStrategy: () => ({}) }));
vi.mock('@odb/billing-gateway', () => ({
  createBillingGatewayService: () => ({
    createCheckoutSession: billing.createCheckoutSession,
  }),
}));
vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    rpc: (
      name: string,
      args: { user_id: string; account_id: string; permission_name: string },
    ) => ({
      throwOnError: async () => ({
        data:
          name === 'has_permission' &&
          args.user_id === 'user-1' &&
          args.account_id === 'acc-1' &&
          args.permission_name === 'billing.manage' &&
          billing.allowed,
      }),
    }),
  }),
}));

import { createTeamCheckoutAction } from './checkout-action';

const params = {
  accountId: 'acc-1',
  productId: 'odb',
  planId: 'odb-monthly',
  returnUrl: 'https://app.example/home/acme/billing',
};

describe('createTeamCheckoutAction', () => {
  it('starts checkout for the billing manager', async () => {
    billing.allowed = true;

    await expect(createTeamCheckoutAction(params)).resolves.toBe('tok');
  });

  it('refuses anyone who cannot manage billing', async () => {
    billing.allowed = false;
    billing.createCheckoutSession.mockClear();

    await expect(createTeamCheckoutAction(params)).rejects.toThrow(
      'Only the team owner can change the plan.',
    );
    expect(billing.createCheckoutSession).not.toHaveBeenCalled();
  });
});
