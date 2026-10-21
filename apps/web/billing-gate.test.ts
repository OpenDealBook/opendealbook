import { afterEach, describe, expect, it, vi } from 'vitest';

import { stubBootEnv } from './test-env';

vi.mock('server-only', () => ({}));
vi.mock('~/config/app.config', () => import('./config/app.config'));
vi.mock('~/config/billing.config', () => import('./config/billing.config'));
vi.mock('~/config/billing-gate', () => import('./config/billing-gate'));
vi.mock('~/config/paths.config', () => import('./config/paths.config'));
vi.mock('~/config/seo', () => import('./config/seo'));
vi.mock(
  '~/components/structured-data',
  () => import('./components/structured-data'),
);
vi.mock('./app/[locale]/(marketing)/pricing/pricing-analytics', () => ({
  PricingAnalytics: () => null,
}));
vi.mock('@odb/team-accounts', () => ({ TeamBillingPanel: () => null }));
vi.mock('./app/[locale]/home/[account]/layout', () => ({
  loadTeamWorkspace: async () => ({
    team: { id: 'team-1', name: 'Acme', slug: 'acme' },
    subscriptionStatus: null,
  }),
}));
vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: 'user-1', email: 'owner@example.com' } },
      }),
    },
  }),
}));

const notFound = { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' };

function billing(value: 'false' | undefined) {
  stubBootEnv({ ENABLE_BILLING: value });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

async function teamNavPaths() {
  const { teamNavigationFor } =
    await import('./config/team-account-navigation.config');

  return teamNavigationFor('acme', []).map((item) => item.path);
}

describe('billing navigation', () => {
  it('lists team billing when billing is on by default', async () => {
    billing(undefined);

    expect(await teamNavPaths()).toContain('/home/acme/billing');
  });

  it('hides team billing when billing is off', async () => {
    billing('false');

    expect(await teamNavPaths()).not.toContain('/home/acme/billing');
  });
});

describe('billing surfaces with billing off', () => {
  it('returns 404 from the team billing page', async () => {
    billing('false');
    const { default: Page } =
      await import('./app/[locale]/home/[account]/billing/page');

    await expect(
      Page({ params: Promise.resolve({ locale: 'en', account: 'acme' }) }),
    ).rejects.toMatchObject(notFound);
  });

  it('returns 404 from the pricing page', async () => {
    billing('false');
    const { default: Page } =
      await import('./app/[locale]/(marketing)/pricing/page');

    await expect(
      Page({ params: Promise.resolve({ locale: 'en' }) }),
    ).rejects.toMatchObject(notFound);
  });

  it('returns 404 from the team checkout action', async () => {
    billing('false');
    const { createTeamCheckoutAction } =
      await import('./app/[locale]/home/[account]/billing/checkout-action');

    await expect(
      createTeamCheckoutAction({
        accountId: 'team-1',
        productId: 'pro',
        planId: 'monthly',
        returnUrl: 'https://example.com/home/acme/billing',
      }),
    ).rejects.toMatchObject(notFound);
  });
});

describe('the Stripe webhook', () => {
  function unsignedDelivery() {
    return new Request('https://example.com/api/billing/webhook', {
      method: 'POST',
      body: '{}',
    });
  }

  it('still rejects an unsigned delivery when billing is on', async () => {
    billing(undefined);
    const { POST } = await import('./app/api/billing/webhook/route');

    expect((await POST(unsignedDelivery())).status).toBe(400);
  });

  it('returns 404 when billing is off', async () => {
    billing('false');
    const { POST } = await import('./app/api/billing/webhook/route');

    await expect(POST(unsignedDelivery())).rejects.toMatchObject(notFound);
  });
});
