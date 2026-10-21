import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import TeamBillingPage from './page';

const workspace = vi.hoisted(() => ({ permissions: [] as string[] }));

vi.mock('@odb/team-accounts', () => ({
  TeamBillingPanel: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../layout', () => ({
  loadTeamWorkspace: async () => ({
    team: { id: 'team-1' },
    subscriptionStatus: null,
    permissions: workspace.permissions,
  }),
}));
vi.mock('~/config/billing-gate', () => ({ requireBilling: () => {} }));
vi.mock('~/config/app.config', () => ({
  default: { url: 'https://app.example' },
}));
vi.mock('~/config/billing.config', () => ({
  default: {
    products: [
      {
        id: 'odb',
        plans: [
          {
            id: 'odb-monthly',
            name: 'Monthly',
            interval: 'month',
            lineItems: [{ cost: 99 }],
          },
        ],
      },
    ],
  },
}));
vi.mock('../../_lib/trial', () => ({
  loadTrialState: async () => ({ isActive: false, endsAt: null }),
}));
vi.mock('../../_components/trial-banner', () => ({ daysLeft: () => 0 }));
vi.mock('./checkout-action', () => ({ createTeamCheckoutAction: vi.fn() }));

async function render() {
  return renderToStaticMarkup(
    await TeamBillingPage({
      params: Promise.resolve({ locale: 'en', account: 'acme' }),
    }),
  );
}

const lockedCheckout = /<fieldset disabled=""[^]*>Checkout</;

describe('team billing page', () => {
  it('lets the billing manager check out', async () => {
    workspace.permissions = ['billing.manage'];

    expect(await render()).not.toMatch(lockedCheckout);
  });

  it('shows anyone else the plans locked with the reason', async () => {
    workspace.permissions = ['settings.manage'];
    const html = await render();

    expect(html).toContain('Only the team owner can change the plan.');
    expect(html).toMatch(lockedCheckout);
  });
});
