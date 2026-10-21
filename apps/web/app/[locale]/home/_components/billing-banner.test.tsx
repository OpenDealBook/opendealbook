import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { BillingBanner } from './billing-banner';

function render(
  standing: 'past_due' | 'locked',
  canManageBilling: boolean,
): string {
  return renderToStaticMarkup(
    <BillingBanner
      standing={standing}
      canManageBilling={canManageBilling}
      billingHref={'/home/acme/billing'}
    />,
  );
}

describe('BillingBanner', () => {
  it('tells every member a payment failed', () => {
    const html = render('past_due', false);

    expect(html).toContain('Payment failed. Update billing to keep access.');
    expect(html).not.toContain('Update payment');
  });

  it('offers billing managers a way to update payment', () => {
    const html = render('past_due', true);

    expect(html).toContain('Payment failed. Update billing to keep access.');
    expect(html).toContain('Update payment');
    expect(html).toContain('href="/home/acme/billing"');
  });

  it('tells a locked team it is read-only without a billing link for most members', () => {
    const html = render('locked', false);

    expect(html).toContain('This team is read-only until billing is updated.');
    expect(html).not.toContain('href="/home/acme/billing"');
    expect(html).not.toContain('Payment failed');
  });

  it('links billing managers of a locked team to billing', () => {
    const html = render('locked', true);

    expect(html).toContain('This team is read-only until billing is updated.');
    expect(html).toContain('href="/home/acme/billing"');
  });
});
