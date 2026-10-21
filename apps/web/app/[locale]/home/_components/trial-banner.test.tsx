import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { TrialBanner } from './trial-banner';

function render(isActive: boolean) {
  return renderToStaticMarkup(
    <TrialBanner
      isActive={isActive}
      endsAt={'2026-01-01T00:00:00.000Z'}
      billingHref={'/home/acme/billing'}
    />,
  );
}

describe('TrialBanner', () => {
  it('shows only an upgrade prompt linking to billing once the trial has ended', () => {
    const html = render(false);

    expect(html).toContain('href="/home/acme/billing"');
    expect(html).toContain('Upgrade to keep working');
    expect(html).not.toContain('days left');
    expect(html).not.toContain('Reload sample deals');
  });

  it('counts down without an upgrade prompt while the trial runs', () => {
    const html = render(true);

    expect(html).toContain('days left in your trial');
    expect(html).not.toContain('href="/home/acme/billing"');
    expect(html).not.toContain('Reload sample deals');
  });
});
