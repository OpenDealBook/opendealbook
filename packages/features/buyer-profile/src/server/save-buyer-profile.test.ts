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
    expertise_json: { areas: ['tax', 'audit'] },
    financing_json: {
      cash_available: '500k',
      max_purchase_price: '2M',
      sba_prequalified: true,
    },
    contact_json: {
      email: 'jordan@example.com',
      phone: '',
      website: 'https://example.com',
    },
    interested_json: ['retiring owners'],
    not_interested_json: ['distressed'],
    photo_path: 'account-1/photo.jpg',
    include_sensitive: false,
    sensitive_json: null,
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

  it('persists the structured jsonb fields', async () => {
    const { client, insert } = makeClient(null);

    await saveBuyerProfile(client, 'account-1', draft());

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        expertise_json: { areas: ['tax', 'audit'] },
        financing_json: {
          cash_available: '500k',
          max_purchase_price: '2M',
          sba_prequalified: true,
        },
        contact_json: {
          email: 'jordan@example.com',
          phone: '',
          website: 'https://example.com',
        },
        interested_json: ['retiring owners'],
        not_interested_json: ['distressed'],
      }),
    );
  });

  it('carries the photo_path into the inserted version', async () => {
    const { client, insert } = makeClient(null);

    await saveBuyerProfile(
      client,
      'account-1',
      draft({ photo_path: 'account-1/headshot.png' }),
    );

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ photo_path: 'account-1/headshot.png' }),
    );
  });

  it('stores sensitive_json when include_sensitive is true', async () => {
    const { client, insert } = makeClient(null);
    const sensitive = {
      credit_score: '780',
      pre_approval: 'SBA 7(a) to 2.5M',
      phone: '555-0100',
    };

    await saveBuyerProfile(
      client,
      'account-1',
      draft({ include_sensitive: true, sensitive_json: sensitive }),
    );

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        include_sensitive: true,
        sensitive_json: sensitive,
      }),
    );
  });

  it('drops sensitive_json when include_sensitive is false', async () => {
    const { client, insert } = makeClient(null);

    await saveBuyerProfile(
      client,
      'account-1',
      draft({
        include_sensitive: false,
        sensitive_json: {
          credit_score: '780',
          pre_approval: 'SBA 7(a) to 2.5M',
          phone: '555-0100',
        },
      }),
    );

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        include_sensitive: false,
        sensitive_json: null,
      }),
    );
  });
});
