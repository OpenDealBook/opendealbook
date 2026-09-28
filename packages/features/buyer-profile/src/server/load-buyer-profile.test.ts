import type { SupabaseClient } from '@supabase/supabase-js';

import { describe, expect, it, vi } from 'vitest';

import type { Database } from '@tuckin/supabase';

import { loadBuyerProfile } from './load-buyer-profile';
import type { BuyerProfile } from './render-buyer-profile-html';

function sampleProfile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    about: 'Second generation operator.',
    account_id: 'account-1',
    contact_json: null,
    created_at: null,
    created_by: null,
    display_name: 'Jordan Buyer',
    experience: 'Ran two regional firms.',
    expertise_json: null,
    financing_json: null,
    headline: 'Acquiring tax and accounting practices',
    id: 'profile-1',
    include_sensitive: false,
    interested_json: null,
    motivation: 'Long term stewardship.',
    not_interested_json: null,
    photo_path: null,
    sensitive_json: null,
    target_statement: 'Firms with 300k to 1M revenue.',
    updated_at: null,
    updated_by: null,
    value_proposition: 'Continuity for staff and clients.',
    version: 1,
    ...overrides,
  };
}

function makeClient(rpc: unknown): SupabaseClient<Database> {
  return { rpc } as unknown as SupabaseClient<Database>;
}

describe('loadBuyerProfile', () => {
  it('returns null when the account has no profile', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const rpc = vi.fn(() => ({ maybeSingle }));
    const client = makeClient(rpc);

    await expect(loadBuyerProfile(client, 'account-1')).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledWith('current_buyer_profile', {
      account_id: 'account-1',
    });
  });

  it('returns the current profile row from the rpc', async () => {
    const profile = sampleProfile();
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: profile, error: null });
    const client = makeClient(vi.fn(() => ({ maybeSingle })));

    await expect(loadBuyerProfile(client, 'account-1')).resolves.toEqual(
      profile,
    );
  });
});
