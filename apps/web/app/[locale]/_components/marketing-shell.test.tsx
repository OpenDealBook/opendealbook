import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { stubBootEnv } from '../../../test-env';

async function renderShell(billing: 'false' | undefined) {
  stubBootEnv({ ENABLE_BILLING: billing });
  const { MarketingShell } = await import('./marketing-shell');

  return renderToStaticMarkup(<MarketingShell>{null}</MarketingShell>);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('MarketingShell', () => {
  it('links to pricing when billing is on', async () => {
    expect(await renderShell(undefined)).toContain('href="/pricing"');
  });

  it('hides the pricing link when billing is off', async () => {
    const html = await renderShell('false');

    expect(html).not.toContain('href="/pricing"');
    expect(html).toContain('href="/blog"');
  });
});
