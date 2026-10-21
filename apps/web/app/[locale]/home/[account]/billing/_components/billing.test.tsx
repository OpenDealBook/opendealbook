// @vitest-environment jsdom
import { act } from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearScreen,
  show,
} from '@odb/lender-rooms/requests-ui/test-support/screen.ts';

import { TeamBillingPanel } from '../../../../../../../../packages/features/team-accounts/src/components/billing/team-billing-panel';
import { PlanChoices } from './plan-choices';

const createTeamCheckoutAction = vi.hoisted(() =>
  vi.fn(async () => 'https://checkout.example/session'),
);

vi.mock('../checkout-action', () => ({ createTeamCheckoutAction }));

afterEach(clearScreen);

const product = {
  id: 'odb',
  name: 'Open Deal Book',
  description: 'Deals',
  currency: 'USD',
  plans: [
    {
      id: 'odb-monthly',
      name: 'Monthly',
      interval: 'month' as const,
      lineItems: [{ id: 'm', name: 'Base', cost: 99, type: 'flat' as const }],
    },
    {
      id: 'odb-yearly',
      name: 'Yearly',
      interval: 'year' as const,
      lineItems: [{ id: 'y', name: 'Base', cost: 990, type: 'flat' as const }],
    },
  ],
};

function planRow(name: string): HTMLElement {
  const found = [...document.querySelectorAll<HTMLElement>('li')].find((row) =>
    row.textContent?.includes(name),
  );

  if (!found) {
    throw new Error(`No plan named "${name}"`);
  }

  return found;
}

function showBilling(trialDaysLeft: number | null) {
  show(
    <TeamBillingPanel
      accountId={'acc-1'}
      subscriptionStatus={null}
      trialDaysLeft={trialDaysLeft}
    >
      <PlanChoices
        accountId={'acc-1'}
        product={product}
        returnUrl={'https://app.example/home/acme/billing'}
      />
    </TeamBillingPanel>,
  );
}

describe('team billing', () => {
  it('shows the days left in place of "No active subscription" during a trial', () => {
    showBilling(30);

    expect(document.body.textContent).toContain('Trial: 30 days left');
    expect(document.body.textContent).not.toContain('No active subscription');
  });

  it('says there is no active subscription when no trial is running', () => {
    showBilling(null);

    expect(document.body.textContent).toContain('No active subscription');
    expect(document.body.textContent).not.toContain('Trial:');
  });

  it('lists every plan with its price', () => {
    showBilling(30);

    expect(planRow('Monthly').textContent).toContain('$99 per month');
    expect(planRow('Yearly').textContent).toContain('$990 per year');
  });

  it('checks out the plan whose button was pressed', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    showBilling(30);

    await act(async () => {
      planRow('Yearly').querySelector('button')!.click();
    });

    expect(createTeamCheckoutAction).toHaveBeenCalledWith({
      accountId: 'acc-1',
      productId: 'odb',
      planId: 'odb-yearly',
      returnUrl: 'https://app.example/home/acme/billing',
    });
    expect(assign).toHaveBeenCalledWith('https://checkout.example/session');
    vi.unstubAllGlobals();
  });
});
