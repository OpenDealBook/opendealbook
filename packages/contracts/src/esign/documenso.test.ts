import type { SupabaseClient } from '@supabase/supabase-js';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@odb/supabase';

import type { ContractStorage } from '../storage';
import {
  createDocumensoClient,
  handleDocumensoWebhook,
  sendForSignature,
} from './documenso';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sendForSignature', () => {
  it('downloads the version pdf and posts it to Documenso', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ documentId: 42, status: 'PENDING' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const builder = {
      select: () => builder,
      eq: () => builder,
      single: vi.fn(async () => ({
        data: {
          pdf_path: 'acc-1/contract-1/v2.pdf',
          contract_id: 'contract-1',
          version: 2,
        },
        error: null,
      })),
    };
    const client = {
      from: vi.fn(() => builder),
    } as unknown as SupabaseClient<Database>;

    const storage: ContractStorage = {
      uploadVersion: vi.fn(async () => undefined),
      downloadVersion: vi.fn(async () => new Uint8Array([9, 9, 9])),
    };

    const result = await sendForSignature(
      {
        contractVersionId: 'ver-2',
        signers: [{ email: 'seller@example.com', name: 'Seller' }],
      },
      {
        client,
        storage,
        documenso: createDocumensoClient({
          url: 'https://sign.test',
          apiKey: 'key-123',
        }),
      },
    );

    expect(storage.downloadVersion).toHaveBeenCalledWith(
      'acc-1/contract-1/v2.pdf',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://sign.test/api/v1/documents',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toEqual({ documentId: '42', status: 'PENDING' });
  });
});

describe('createDocumensoClient', () => {
  it('throws when Documenso returns a non-2xx status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    );

    const client = createDocumensoClient({
      url: 'https://sign.test',
      apiKey: 'key-123',
    });

    await expect(
      client.createDocument({
        title: 'LOI',
        externalId: 'ver-2',
        pdf: new Uint8Array(),
        signers: [],
      }),
    ).rejects.toThrow('Documenso responded with 500');
  });
});

describe('handleDocumensoWebhook', () => {
  it('marks the version signed and stores the content hash on completion', async () => {
    const updates: unknown[] = [];
    const builder = {
      update: (row: unknown) => {
        updates.push(row);
        return builder;
      },
      eq: vi.fn(async () => ({ error: null })),
    };
    const client = {
      from: vi.fn(() => builder),
    } as unknown as SupabaseClient<Database>;

    await handleDocumensoWebhook(
      {
        event: 'document.completed',
        payload: { externalId: 'ver-2', documentHash: 'sha256:abc' },
      },
      { client },
    );

    expect(updates).toContainEqual({
      is_signed: true,
      content_hash: 'sha256:abc',
    });
  });

  it('ignores events that are not a completed signature', async () => {
    const from = vi.fn();
    const client = { from } as unknown as SupabaseClient<Database>;

    await handleDocumensoWebhook(
      {
        event: 'document.sent',
        payload: { externalId: 'ver-2', documentHash: '' },
      },
      { client },
    );

    expect(from).not.toHaveBeenCalled();
  });
});
