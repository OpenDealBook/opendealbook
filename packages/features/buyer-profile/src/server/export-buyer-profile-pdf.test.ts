import type { SupabaseClient } from '@supabase/supabase-js';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@odb/supabase';

import { exportBuyerProfilePdf } from './export-buyer-profile-pdf';
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

describe('exportBuyerProfilePdf', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads, renders, and converts a profile into pdf bytes', async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: sampleProfile(), error: null });
    const client = {
      rpc: vi.fn(() => ({ maybeSingle })),
    } as unknown as SupabaseClient<Database>;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => '',
        arrayBuffer: async () => new ArrayBuffer(8),
      })),
    );

    const profile = await loadBuyerProfile(client, 'account-1');
    const pdf = await exportBuyerProfilePdf(profile!);

    expect(pdf).toBeInstanceOf(Uint8Array);
  });

  it('throws when display_name is null', () => {
    expect(() =>
      exportBuyerProfilePdf(sampleProfile({ display_name: null })),
    ).toThrow(/display_name/);
  });
});
