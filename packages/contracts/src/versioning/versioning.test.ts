import type { SupabaseClient } from '@supabase/supabase-js';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appendDealEvent } from '@odb/events';
import type { Database } from '@odb/supabase';

import type { ContractStorage } from '../storage';
import { appendContractVersion, createContractRecord } from './versioning';

vi.mock('@odb/events', () => ({
  appendDealEvent: vi.fn(async () => [{ deal_seq: 1, aggregate_seq: 1 }]),
}));

const appendDealEventMock = vi.mocked(appendDealEvent);

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

beforeEach(() => {
  appendDealEventMock.mockClear();
});

describe('appendContractVersion', () => {
  it('inserts an immutable version and advances the pointer through a version_set event', async () => {
    const { client, inserts } = makeClient([
      { data: { account_id: 'acc-1', deal_id: 'deal-1' }, error: null },
      { data: { version: 3 }, error: null },
      {
        data: { id: 'ver-4', version: 4, source: 'upload' },
        error: null,
      },
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
    expect(appendDealEventMock).toHaveBeenCalledWith(client, {
      dealId: 'deal-1',
      aggregateType: 'contract',
      aggregateId: 'contract-1',
      eventType: 'contract.version_set',
      payload: { current_version: 4 },
    });
    expect(result.version).toBe(4);
  });
});

describe('createContractRecord', () => {
  it('creates the contract through a contract.created event and returns the new id', async () => {
    const { client } = makeClient([
      { data: { account_id: 'acc-1' }, error: null },
    ]);

    const id = await createContractRecord(
      { dealId: 'deal-1', type: 'loi' },
      {
        client,
        createdByUserId: 'user-1',
        generateVersionOne: vi.fn(),
      },
    );

    expect(appendDealEventMock).toHaveBeenCalledTimes(1);
    expect(appendDealEventMock).toHaveBeenCalledWith(client, {
      dealId: 'deal-1',
      aggregateType: 'contract',
      aggregateId: id,
      eventType: 'contract.created',
      payload: { type: 'loi', status: 'draft', current_version: 0 },
    });
  });
});
