import { describe, expect, it } from 'vitest';

import TeamDealClosePage from './page';

describe('the old Close tab', () => {
  it('permanently redirects to Customer transition', async () => {
    const thrown = await TeamDealClosePage({
      params: Promise.resolve({
        locale: 'en',
        account: 'harbor',
        id: 'deal-1',
      }),
    }).catch((error: unknown) => error);

    expect((thrown as { digest: string }).digest).toMatch(
      /^NEXT_REDIRECT;replace;\/home\/harbor\/deals\/deal-1\/customer-transition;308;/,
    );
  });
});
