import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { stageUpload } from '@odb/data-room/uploads/actions';

import {
  type IntegrationAccount,
  provisionAccount,
} from '../../../../../../packages/features/deals/test-support/integration-harness';

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const requestClients = vi.hoisted(() => ({
  client: null as unknown,
  admin: null as unknown,
}));

vi.mock('@odb/supabase/server', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSupabaseServerClient: () => requestClients.client,
}));

vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => requestClients.admin,
}));

import { expandDataRoomUpload } from './expand-data-room-upload';

const converter = { working: true, server: null as unknown as Server };

let owner: IntegrationAccount;
let dealId: string;
let folderId: string;

async function uploadFile(name: string, text: string) {
  const staged = await stageUpload({
    dealId,
    kind: 'single',
    files: [
      {
        originalPath: name,
        contentType: 'application/octet-stream',
        body: new TextEncoder().encode(text),
      },
    ],
  });
  if (!staged.ok) {
    throw new Error(staged.refusal);
  }

  const expanded = await expandDataRoomUpload({
    dealId,
    batchId: staged.value.batch.id,
    targetFolderId: folderId,
  });
  if (!expanded.ok) {
    throw new Error(expanded.refusal);
  }

  return expanded.value.items[0]!;
}

async function storedText(path: string): Promise<string | null> {
  const { data } = await owner.admin.storage.from('data-room').download(path);

  return data ? await data.text() : null;
}

beforeAll(async () => {
  converter.server = createServer((request, response) => {
    const chunks: Buffer[] = [];

    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const file = /filename="[^"]+"[\s\S]*?\r\n\r\n([\s\S]*?)\r\n--/.exec(
        Buffer.concat(chunks).toString('latin1'),
      );

      response.writeHead(converter.working && file ? 200 : 500);
      response.end(
        converter.working && file ? `%PDF-1.7 of ${file[1]}` : 'down',
      );
    });
  });
  await new Promise<void>((resolve) => converter.server.listen(0, resolve));
  process.env.GOTENBERG_URL = `http://127.0.0.1:${(converter.server.address() as AddressInfo).port}`;

  owner = await provisionAccount();
  requestClients.client = owner.user;
  requestClients.admin = owner.admin;
  dealId = crypto.randomUUID();

  const { data: firm } = await owner.user
    .from('firm')
    .insert({ account_id: owner.accountId, name: 'Brennan Tooling' })
    .select('id')
    .single()
    .throwOnError();
  await owner.user
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'deal',
      p_aggregate_id: dealId,
      p_event_type: 'deal.created',
      p_payload: {
        account_id: owner.accountId,
        owner_user_id: owner.userId,
        firm_id: firm.id,
      },
    })
    .throwOnError();
  const { data: folder } = await owner.user
    .from('dr_folder')
    .insert({ account_id: owner.accountId, deal_id: dealId, name: 'Legal' })
    .select('id')
    .single()
    .throwOnError();
  folderId = folder.id;
});

afterAll(async () => {
  converter.server.close();
  await owner.cleanup();
});

describe('Documents tab upload', () => {
  it('stores the converted PDF beside an uploaded Word file', async () => {
    const item = await uploadFile('Lease.docx', 'lease words');

    expect(item.status).toBe('imported');
    expect(await storedText(`${item.storage_path}.preview.pdf`)).toBe(
      '%PDF-1.7 of lease words',
    );
  });

  it('still uploads a Word file, without a preview, when the conversion fails', async () => {
    converter.working = false;
    const item = await uploadFile('Unconverted.docx', 'words').finally(() => {
      converter.working = true;
    });

    expect(item.status).toBe('imported');
    expect(await storedText(`${item.storage_path}.preview.pdf`)).toBeNull();
  });

  it('leaves a PowerPoint file to be converted when it is first viewed', async () => {
    const item = await uploadFile('Deck.pptx', 'slides');

    expect(item.status).toBe('imported');
    expect(await storedText(`${item.storage_path}.preview.pdf`)).toBeNull();
  });
});
