import type { SupabaseClient } from '@supabase/supabase-js';

import { describe, expect, it, vi } from 'vitest';

import type { Database } from '@odb/supabase';

import type { BuyerProfileDraft } from './save-buyer-profile';
import { saveBuyerProfile } from './save-buyer-profile';

function draft(overrides: Partial<BuyerProfileDraft> = {}): BuyerProfileDraft {
  return {
    about: 'Second generation operator.',
    display_name: 'Jordan Buyer',
    experience: 'Ran two regional firms.',
    headline: 'Acquiring tax and accounting practices',
    motivation: 'Long term stewardship.',
    target_statement: 'Firms with 300k to 1M revenue.',
    value_proposition: 'Continuity for staff and clients.',
    ...overrides,
  };
}

function makeClient(currentVersion: number | null) {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const maybeSingle = vi.fn().mockResolvedValue({
    data: currentVersion === null ? null : { version: currentVersion },
    error: null,
  });
  const client = {
    rpc: vi.fn(() => ({ maybeSingle })),
    from: vi.fn(() => ({ insert })),
  } as unknown as SupabaseClient<Database>;

  return { client, insert };
}

describe('saveBuyerProfile', () => {
  it('inserts version 1 when the account has no profile yet', async () => {
    const { client, insert } = makeClient(null);

    await saveBuyerProfile(client, 'account-1', draft());

    expect(insert).toHaveBeenCalledWith({
      account_id: 'account-1',
      version: 1,
      ...draft(),
    });
  });

  it('inserts the next version when a profile already exists', async () => {
    const { client, insert } = makeClient(3);

    await saveBuyerProfile(client, 'account-1', draft({ headline: 'Updated' }));

    expect(insert).toHaveBeenCalledWith({
      account_id: 'account-1',
      version: 4,
      ...draft({ headline: 'Updated' }),
    });
  });
});
