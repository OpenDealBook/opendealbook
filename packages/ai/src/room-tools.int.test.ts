import type { SupabaseClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@odb/supabase';

import {
  appendDealEvent,
  provisionAccount,
  seedDeal,
  type IntegrationAccount,
} from '../../workflows/test-support/integration-harness';
import { roomTools, runRoomTool } from './room-tools';
import { documentTools, runDocumentTool } from './tools';

let owner: IntegrationAccount;
let outsider: IntegrationAccount;
let dealId: string;

const roomA = crypto.randomUUID();
const roomB = crypto.randomUUID();

const shown = crypto.randomUUID();
const shownV2 = crypto.randomUUID();
const hidden = crypto.randomUUID();
const hiddenV2 = crypto.randomUUID();
const withheld = crypto.randomUUID();
const hiddenModel = crypto.randomUUID();
const forB = crypto.randomUUID();
const removed = crypto.randomUUID();
const shownModel = crypto.randomUUID();
const notInPackage = crypto.randomUUID();

const hiddenNames = [
  'hidden.pdf',
  'hidden-model.xlsx',
  'for-b.pdf',
  'removed.pdf',
  'not-in-package.pdf',
  'withheld.pdf',
];
const hiddenIds = [
  hidden,
  hiddenV2,
  hiddenModel,
  forB,
  removed,
  notInPackage,
  withheld,
];

async function addFolder(name: string, parentId: string | null = null) {
  const { data } = await owner.admin
    .from('dr_folder')
    .insert({
      account_id: owner.accountId,
      deal_id: dealId,
      name,
      parent_id: parentId,
    })
    .select('id')
    .single()
    .throwOnError();
  return data.id as string;
}

async function addFaqEntry(
  question: string,
  status: 'draft' | 'published',
): Promise<string> {
  const { data } = await owner.admin
    .from('lender_faq_entry')
    .insert({
      account_id: owner.accountId,
      deal_id: dealId,
      question,
      answer: `${question} answered.`,
      status,
    })
    .select('id')
    .single()
    .throwOnError();
  return data.id as string;
}

beforeAll(async () => {
  owner = await provisionAccount();
  outsider = await provisionAccount();
  const admin = owner.admin;
  dealId = await seedDeal(admin, owner.accountId, owner.userId, {
    description: 'Room tools deal',
  });
  const master = await addFolder('Lender package');
  const privateA = await addFolder('Lender A only');
  const privateB = await addFolder('Lender B only');
  const diligence = await addFolder('Diligence');
  const withheldFolder = await addFolder('Withheld from A', master);

  const documents: [string, string, string, number][] = [
    [master, shown, 'shown.pdf', 1],
    [master, shownV2, 'shown.pdf', 2],
    [master, hidden, 'hidden.pdf', 1],
    [master, hiddenV2, 'hidden.pdf', 2],
    [master, hiddenModel, 'hidden-model.xlsx', 1],
    [privateA, shownModel, 'shown-model.xlsx', 1],
    [privateB, forB, 'for-b.pdf', 1],
    [master, removed, 'removed.pdf', 1],
    [diligence, notInPackage, 'not-in-package.pdf', 1],
    [withheldFolder, withheld, 'withheld.pdf', 1],
  ];
  for (const [folderId, id, name, version] of documents) {
    await appendDealEvent(admin, {
      dealId,
      aggregateType: 'dr_document',
      aggregateId: id,
      eventType: 'dr_document.added',
      payload: {
        folder_id: folderId,
        name,
        storage_path: `deal/${dealId}/${id}`,
        version,
      },
    });
  }
  await appendDealEvent(admin, {
    dealId,
    aggregateType: 'dr_document',
    aggregateId: removed,
    eventType: 'dr_document.removed',
  });

  const segment = (documentId: string, text: string, version = 1) => ({
    account_id: owner.accountId,
    deal_id: dealId,
    dr_document_id: documentId,
    document_version: version,
    segment_index: 0,
    kind: 'page' as const,
    page_from: 1,
    page_to: 1,
    text,
    from_ocr: false,
    content_hash: `${documentId}-0`,
  });
  const block = (documentId: string, text: string) => ({
    ...segment(documentId, text),
    kind: 'sheet_block' as const,
    page_from: null,
    page_to: null,
    sheet: 'P&L',
    cell_range: 'A1:C9',
  });
  await admin
    .from('document_segment')
    .insert([
      segment(shown, 'Revenue was 1.4 million in the shown CIM.'),
      segment(shownV2, 'Revenue was 1.5 million in the revised CIM.', 2),
      segment(hidden, 'Revenue was 9.9 million in the hidden draft.'),
      segment(hiddenV2, 'Revenue was 9.8 million in the hidden revision.', 2),
      segment(withheld, 'Revenue was 3.3 million in the withheld letter.'),
      block(hiddenModel, 'Revenue by month in the hidden model.'),
      block(shownModel, 'Revenue by month in the shown model.'),
      segment(forB, 'Revenue terms offered to lender B.'),
      segment(removed, 'Revenue was 7.7 million in the removed draft.'),
      segment(notInPackage, 'Revenue was 5.5 million in diligence notes.'),
    ])
    .throwOnError();

  await admin
    .from('lender_package')
    .insert({
      deal_id: dealId,
      account_id: owner.accountId,
      master_folder_id: master,
    })
    .throwOnError();
  const room = (id: string, name: string, private_folder_id: string) => ({
    id,
    account_id: owner.accountId,
    deal_id: dealId,
    name,
    private_folder_id,
  });
  await admin
    .from('lender_room')
    .insert([
      room(roomA, 'Lender A', privateA),
      room(roomB, 'Lender B', privateB),
    ])
    .throwOnError();
  await admin
    .from('lender_room_hidden')
    .insert([
      { room_id: roomA, dr_document_id: hidden },
      { room_id: roomA, dr_document_id: hiddenModel },
      { room_id: roomA, dr_folder_id: withheldFolder },
    ])
    .throwOnError();

  await addFaqEntry('What covenant package is offered?', 'published');
  await addFaqEntry('Which covenant waivers are drafted?', 'draft');
  const unpublished = await addFaqEntry(
    'Which covenant was withdrawn?',
    'published',
  );
  await admin
    .from('lender_faq_entry')
    .update({ status: 'unpublished' })
    .eq('id', unpublished)
    .throwOnError();
  const hiddenFromA = await addFaqEntry(
    'Which covenant applies only to lender B?',
    'published',
  );
  await admin
    .from('lender_faq_hidden')
    .insert({ room_id: roomA, deal_id: dealId, entry_id: hiddenFromA })
    .throwOnError();
  await addFaqEntry(
    'Which basket covers the basket carve-out basket?',
    'published',
  );
  for (let basket = 1; basket <= 12; basket++) {
    await addFaqEntry(`How large is basket ${basket}?`, 'published');
  }
});

afterAll(async () => {
  await owner.admin
    .from('lender_room')
    .delete()
    .in('id', [roomA, roomB])
    .throwOnError();
  await owner.cleanup();
  await outsider.cleanup();
});

function inRoomA(account: IntegrationAccount) {
  return {
    client: account.user as SupabaseClient<Database>,
    roomId: roomA,
  };
}

function call(name: string, input: unknown) {
  return { id: 'call-1', name, input };
}

function expectNothingHidden(
  result: { content: string; citations: object[] },
  leaks = [...hiddenNames, ...hiddenIds],
) {
  for (const leak of leaks) {
    expect(result.content).not.toContain(leak);
    expect(JSON.stringify(result.citations)).not.toContain(leak);
  }
}

const documentReads: [string, Record<string, unknown>][] = [
  ['read_document_pages', { from_page: 1, to_page: 1 }],
  ['list_sheets', {}],
  ['read_sheet_range', { sheet: 'P&L', a1_range: 'A1:C9' }],
];

describe('roomTools', () => {
  it('offers the deal document tools with the same arguments, plus an FAQ search, and never past answers or a room id argument', () => {
    const dealSchemas = new Map(
      documentTools.map((tool) => [tool.name, tool.inputSchema]),
    );
    expect(roomTools.map((tool) => tool.name).sort()).toEqual([
      'list_documents',
      'list_sheets',
      'read_document_pages',
      'read_sheet_range',
      'search_documents',
      'search_faq',
    ]);
    for (const tool of roomTools) {
      if (tool.name !== 'search_faq') {
        expect(tool.inputSchema).toEqual(dealSchemas.get(tool.name));
      }
      expect(tool.inputSchema).not.toHaveProperty(['properties', 'room_id']);
      expect(tool.inputSchema).not.toHaveProperty(['properties', 'deal_id']);
    }
  });

  it('refuses a call without a room id at compile time', () => {
    const context = { client: owner.user as SupabaseClient<Database> };
    // @ts-expect-error a room tool needs the room id
    const refused = () => runRoomTool(context, call('list_documents', {}));
    expect(refused).toBeTypeOf('function');
  });
});

describe('runRoomTool (integration)', () => {
  it('searches only the documents room A shows, with the same output and citations as the deal search', async () => {
    const result = await runRoomTool(
      inRoomA(owner),
      call('search_documents', { query: 'revenue' }),
    );

    expect(result.isError).toBeUndefined();
    expect(
      result.citations.map((citation) => citation.documentId).sort(),
    ).toEqual([shownV2, shownModel].sort());
    expectNothingHidden(result);

    const dealResult = await runDocumentTool(
      { client: owner.user as SupabaseClient<Database>, dealId },
      call('search_documents', { query: 'revised CIM' }),
    );
    expect(dealResult.citations).toHaveLength(1);
    expect(
      await runRoomTool(
        inRoomA(owner),
        call('search_documents', { query: 'revised CIM' }),
      ),
    ).toEqual(dealResult);
  });

  it('never finds a hidden or removed document, even among earlier versions', async () => {
    const result = await runRoomTool(
      inRoomA(owner),
      call('search_documents', {
        query: 'revenue',
        include_earlier_versions: true,
      }),
    );

    expect(
      result.citations.map((citation) => citation.documentId).sort(),
    ).toEqual([shown, shownV2, shownModel].sort());
    expectNothingHidden(result);
  });

  it('lists only the documents room A shows', async () => {
    const result = await runRoomTool(
      inRoomA(owner),
      call('list_documents', {}),
    );

    expect(result.content).toBe(
      [
        `shown-model.xlsx v1, document ${shownModel}, sheets: P&L`,
        `shown.pdf v2, document ${shownV2}, 1 pages`,
      ].join('\n'),
    );
  });

  it('reads a shown document exactly as the deal tool does', async () => {
    const input = { document_id: shown, from_page: 1, to_page: 1 };
    const result = await runRoomTool(
      inRoomA(owner),
      call('read_document_pages', input),
    );
    const dealResult = await runDocumentTool(
      { client: owner.user as SupabaseClient<Database>, dealId },
      call('read_document_pages', input),
    );

    expect(result.isError).toBeUndefined();
    expect(result).toEqual(dealResult);
  });

  it('reads a shown workbook exactly as the deal tool does', async () => {
    const input = { document_id: shownModel, sheet: 'P&L', a1_range: 'A1:C9' };
    const result = await runRoomTool(
      inRoomA(owner),
      call('read_sheet_range', input),
    );
    const dealResult = await runDocumentTool(
      { client: owner.user as SupabaseClient<Database>, dealId },
      call('read_sheet_range', input),
    );

    expect(result.isError).toBeUndefined();
    expect(result).toEqual(dealResult);
  });

  it.each(
    documentReads.flatMap(([name, args]) =>
      hiddenIds.map((documentId) => [name, documentId, args] as const),
    ),
  )(
    '%s refuses hidden document %s without naming it',
    async (name, documentId, args) => {
      const result = await runRoomTool(
        inRoomA(owner),
        call(name, { document_id: documentId, ...args }),
      );

      expect(result.isError).toBe(true);
      expect(result.content).toBe(
        `No document ${documentId} in this lender room.`,
      );
      expectNothingHidden(result, hiddenNames);
    },
  );

  it("returns nothing from another team's room", async () => {
    const outsiderInRoomA = inRoomA(outsider);

    const search = await runRoomTool(
      outsiderInRoomA,
      call('search_documents', { query: 'revenue' }),
    );
    expect(search).toEqual({ content: 'No matches.', citations: [] });

    const list = await runRoomTool(outsiderInRoomA, call('list_documents', {}));
    expect(list).toEqual({ content: 'No documents.', citations: [] });

    const read = await runRoomTool(
      outsiderInRoomA,
      call('read_document_pages', {
        document_id: shown,
        from_page: 1,
        to_page: 1,
      }),
    );
    expect(read.isError).toBe(true);
    expect(read.content).not.toContain('shown.pdf');

    const faq = await runRoomTool(
      outsiderInRoomA,
      call('search_faq', { query: 'covenant' }),
    );
    expect(faq.content).not.toContain('covenant');
  });

  it("searches only the room's published FAQ, without citations", async () => {
    const result = await runRoomTool(
      inRoomA(owner),
      call('search_faq', { query: 'covenant' }),
    );

    expect(result.isError).toBeUndefined();
    expect(result.content).toContain('What covenant package is offered?');
    expect(result.content).toContain(
      'What covenant package is offered? answered.',
    );
    expect(result.content).not.toContain('waivers');
    expect(result.content).not.toContain('withdrawn');
    expect(result.content).not.toContain('only to lender B');
    expect(result.citations).toEqual([]);
  });

  it('returns the 10 best FAQ matches', async () => {
    const result = await runRoomTool(
      inRoomA(owner),
      call('search_faq', { query: 'basket' }),
    );

    expect(result.content.match(/^Question: /gm)).toHaveLength(10);
    expect(result.content).toMatch(
      /^Question: Which basket covers the basket carve-out basket\?/,
    );
  });

  it('says when the FAQ has no match', async () => {
    const result = await runRoomTool(
      inRoomA(owner),
      call('search_faq', { query: 'warehouse' }),
    );

    expect(result).toEqual({ content: 'No FAQ entries.', citations: [] });
  });

  it('refuses search_past_answers', async () => {
    const result = await runRoomTool(
      inRoomA(owner),
      call('search_past_answers', { query: 'covenant' }),
    );

    expect(result).toEqual({
      content: 'Unknown tool "search_past_answers".',
      isError: true,
      citations: [],
    });
  });
});
