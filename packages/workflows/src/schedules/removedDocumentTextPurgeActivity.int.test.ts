import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  appendDealEvent,
  provisionAccount,
  seedDeal,
  type IntegrationAccount,
} from '../../test-support/integration-harness';
import { purgeRemovedDocumentText } from './removedDocumentTextPurgeActivity';

let owner: IntegrationAccount;
let dealId: string;
let folderId: string;
let liveDocumentId: string;
let removedDocumentId: string;

async function addIndexedDocument(name: string): Promise<string> {
  const documentId = crypto.randomUUID();
  await appendDealEvent(owner.admin, {
    dealId,
    aggregateType: 'dr_document',
    aggregateId: documentId,
    eventType: 'dr_document.added',
    payload: {
      folder_id: folderId,
      name,
      storage_path: `deal/${dealId}/${name}`,
    },
  });
  await owner.admin
    .from('document_chunk')
    .insert({
      account_id: owner.accountId,
      deal_id: dealId,
      document_id: documentId,
      chunk_index: 0,
      content: name,
    })
    .throwOnError();
  await owner.admin
    .from('embedding_job')
    .insert({
      account_id: owner.accountId,
      deal_id: dealId,
      dr_document_id: documentId,
      status: 'done',
    })
    .throwOnError();
  return documentId;
}

async function indexedDocumentIds() {
  const { data: chunks } = await owner.admin
    .from('document_chunk')
    .select('document_id')
    .eq('deal_id', dealId)
    .throwOnError();
  const { data: jobs } = await owner.admin
    .from('embedding_job')
    .select('dr_document_id')
    .eq('deal_id', dealId)
    .throwOnError();
  return {
    chunks: chunks.map((chunk) => chunk.document_id),
    jobs: jobs.map((job) => job.dr_document_id),
  };
}

beforeAll(async () => {
  owner = await provisionAccount();
  dealId = await seedDeal(owner.admin, owner.accountId, owner.userId, {
    description: 'Purge deal',
  });
  const { data: folder } = await owner.admin
    .from('dr_folder')
    .insert({ account_id: owner.accountId, deal_id: dealId, name: 'Root' })
    .select('id')
    .single()
    .throwOnError();
  folderId = folder.id;
  liveDocumentId = await addIndexedDocument('cim.pdf');
  removedDocumentId = await addIndexedDocument('removed.pdf');
  await appendDealEvent(owner.admin, {
    dealId,
    aggregateType: 'dr_document',
    aggregateId: removedDocumentId,
    eventType: 'dr_document.removed',
  });
});

afterAll(async () => {
  await owner.admin.from('accounts').delete().eq('id', owner.accountId);
  await owner.cleanup();
});

describe('purgeRemovedDocumentText', () => {
  it('deletes the chunks and embedding jobs of removed documents, keeps live ones, and converges when run again', async () => {
    await purgeRemovedDocumentText();
    await purgeRemovedDocumentText();

    expect(await indexedDocumentIds()).toEqual({
      chunks: [liveDocumentId],
      jobs: [liveDocumentId],
    });
  });
});
