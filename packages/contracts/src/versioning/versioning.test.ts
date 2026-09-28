import type { SupabaseClient } from '@supabase/supabase-js';

import { describe, expect, it, vi } from 'vitest';

import type { Database } from '@odb/supabase';

import type { ContractStorage } from '../storage';
import { appendContractVersion } from './versioning';

function makeClient(results: Array<{ data: unknown; error: unknown }>) {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];

  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    insert: (row: unknown) => {
      inserts.push(row);
      return builder;
    },
    update: (row: unknown) => {
      updates.push(row);
      return builder;
    },
    single: vi.fn(async () => results.shift()),
    maybeSingle: vi.fn(async () => results.shift()),
  };

  const client = {
    from: vi.fn(() => builder),
  } as unknown as SupabaseClient<Database>;

  return { client, inserts, updates };
}

describe('appendContractVersion', () => {
  it('inserts an immutable version at max plus one and advances the pointer', async () => {
    const { client, inserts, updates } = makeClient([
      { data: { account_id: 'acc-1' }, error: null },
      { data: { version: 3 }, error: null },
      {
        data: { id: 'ver-4', version: 4, source: 'upload' },
        error: null,
      },
      { data: { id: 'contract-1', current_version: 4 }, error: null },
    ]);

    const storage: ContractStorage = {
      uploadVersion: vi.fn(async () => undefined),
      downloadVersion: vi.fn(async () => new Uint8Array()),
    };

    const result = await appendContractVersion(
      {
        contractId: 'contract-1',
        docxBytes: new Uint8Array([1, 2, 3]),
        party: 'seller',
        changeSummary: 'Countered on price',
      },
      { client, storage, authorUserId: 'user-1' },
      'upload',
    );

    expect(storage.uploadVersion).toHaveBeenCalledWith(
      'acc-1/contract-1/v4.docx',
      expect.any(Uint8Array),
      expect.any(String),
    );
    expect(inserts).toContainEqual(
      expect.objectContaining({
        contract_id: 'contract-1',
        account_id: 'acc-1',
        version: 4,
        source: 'upload',
        party: 'seller',
        change_summary: 'Countered on price',
      }),
    );
    expect(updates).toContainEqual({ current_version: 4 });
    expect(result.version).toBe(4);
  });
});
