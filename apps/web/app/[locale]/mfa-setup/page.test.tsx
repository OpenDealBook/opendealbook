import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@odb/accounts/mfa', () => ({ MultiFactorAuthSection: () => null }));
vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}));

import MfaSetupPage from './page';

async function render(searchParams: { team?: string }) {
  return renderToStaticMarkup(
    await MfaSetupPage({ searchParams: Promise.resolve(searchParams) }),
  );
}

describe('MfaSetupPage', () => {
  it("lets a user arriving from onboarding continue to their team's home", async () => {
    expect(await render({ team: 'acme' })).toContain('href="/home/acme"');
  });

  it('offers no team link when not arriving from onboarding', async () => {
    expect(await render({})).not.toContain('/home/');
  });
});
