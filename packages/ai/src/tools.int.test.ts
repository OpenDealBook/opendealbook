import type { SupabaseClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@odb/supabase';

import {
  appendDealEvent,
  provisionAccount,
  seedDeal,
  type IntegrationAccount,
} from '../../workflows/test-support/integration-harness';
import { documentTools, runDocumentTool } from './tools';

let owner: IntegrationAccount;
let outsider: IntegrationAccount;
let dealId: string;
let otherDealId: string;

const cimV1 = crypto.randomUUID();
const cimV2 = crypto.randomUUID();
const scan = crypto.randomUUID();
const report = crypto.randomUUID();
const model = crypto.randomUUID();
const elsewhere = crypto.randomUUID();

async function addFolder(admin: SupabaseClient, deal: string) {
  const { data } = await admin
    .from('dr_folder')
    .insert({ account_id: owner.accountId, deal_id: deal, name: 'Diligence' })
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
    description: 'Tools deal',
  });
  const folder = await addFolder(admin, dealId);
  otherDealId = await seedDeal(admin, owner.accountId, owner.userId, {
    description: 'Other deal',
  });
  const otherFolder = await addFolder(admin, otherDealId);
  const documents: [string, string, string, number][] = [
    [folder, cimV1, 'cim.pdf', 1],
    [folder, cimV2, 'cim.pdf', 2],
    [folder, scan, 'scan.pdf', 1],
    [folder, report, 'report.pdf', 1],
    [folder, model, 'model.xlsx', 1],
    [otherFolder, elsewhere, 'elsewhere.pdf', 1],
  ];
  for (const [folderId, id, name, version] of documents) {
    const deal = folderId === folder ? dealId : otherDealId;
    await appendDealEvent(admin, {
      dealId: deal,
      aggregateType: 'dr_document',
      aggregateId: id,
      eventType: 'dr_document.added',
      payload: {
        folder_id: folderId,
        name,
        storage_path: `deal/${deal}/${id}`,
        version,
      },
    });
  }
  const page = (
    documentId: string,
    version: number,
    index: number,
    pages: [number, number],
    text: string,
    fromOcr = false,
  ) => ({
    account_id: owner.accountId,
    deal_id: dealId,
    dr_document_id: documentId,
    document_version: version,
    segment_index: index,
    kind: 'page' as const,
    page_from: pages[0],
    page_to: pages[1],
    text,
    from_ocr: fromOcr,
    content_hash: `${documentId}-${index}`,
  });
  const block = (
    index: number,
    sheet: string,
    cellRange: string,
    text: string,
  ) => ({
    account_id: owner.accountId,
    deal_id: dealId,
    dr_document_id: model,
    document_version: 1,
    segment_index: index,
    kind: 'sheet_block' as const,
    sheet,
    cell_range: cellRange,
    text,
    from_ocr: false,
    content_hash: `${model}-${index}`,
  });
  await admin
    .from('document_segment')
    .insert([
      page(cimV1, 1, 0, [1, 1], 'Revenue was 1.2 million in the old draft.'),
      page(
        cimV2,
        2,
        0,
        [1, 1],
        'Revenue was 1.4 million with an EBITDA addback.',
      ),
      page(cimV2, 2, 1, [2, 3], 'Customer list, see Schedule 4.13.'),
      page(scan, 1, 0, [1, 1], 'Signed lease for the warehouse.', true),
      page(report, 1, 0, [1, 1], 'a'.repeat(20000)),
      page(report, 1, 1, [2, 2], 'b'.repeat(20000)),
      page(report, 1, 2, [3, 3], 'c'.repeat(20000)),
      block(0, 'P&L', 'A1:F40', 'P&L rows 1 to 40'),
      block(1, 'P&L', 'A41:F80', 'P&L rows 41 to 80'),
      block(2, 'Balance sheet', 'A1:C9', 'Balance sheet rows 1 to 9'),
      {
        ...page(elsewhere, 1, 0, [1, 1], 'Text from another deal.'),
        deal_id: otherDealId,
      },
    ])
    .throwOnError();
});

async function addAnswer(
  admin: SupabaseClient,
  deal: string,
  question: string,
  status: 'answered' | 'failed',
  answer: string | null,
) {
  const { data: thread } = await admin
    .from('deal_ai_thread')
    .insert({ deal_id: deal })
    .select('id')
    .single()
    .throwOnError();
  await admin
    .from('deal_ai_question')
    .insert({
      thread_id: thread.id,
      deal_id: deal,
      question,
      answer,
      status,
      finished_at: new Date().toISOString(),
    })
    .throwOnError();
}

beforeAll(async () => {
  await addAnswer(
    owner.admin,
    dealId,
    'What is the warranty period?',
    'answered',
    'The warranty runs two years [cim.pdf v2, p. 2-3].',
  );
  await addAnswer(
    owner.admin,
    dealId,
    'Who signs the warranty?',
    'failed',
    null,
  );
  await addAnswer(
    owner.admin,
    otherDealId,
    'Does the warranty transfer?',
    'answered',
    'It transfers on sale.',
  );
});

afterAll(async () => {
  await owner.cleanup();
  await outsider.cleanup();
});

function asUser(account: IntegrationAccount) {
  return {
    client: account.user as SupabaseClient<Database>,
    dealId,
  };
}

function call(name: string, input: unknown) {
  return { id: 'call-1', name, input };
}

describe('documentTools', () => {
  it('offers the six document tools, none of which lets the model choose the deal', () => {
    expect(documentTools.map((tool) => tool.name).sort()).toEqual([
      'list_documents',
      'list_sheets',
      'read_document_pages',
      'read_sheet_range',
      'search_documents',
      'search_past_answers',
    ]);
    for (const tool of documentTools) {
      expect(tool.inputSchema).not.toHaveProperty(['properties', 'deal_id']);
    }
  });
});

describe('runDocumentTool (integration)', () => {
  it('searches the latest versions and cites each page range it returned', async () => {
    const result = await runDocumentTool(
      asUser(owner),
      call('search_documents', { query: 'revenue' }),
    );

    expect(result.isError).toBeUndefined();
    expect(result.content).toContain('cim.pdf v2, p. 1');
    expect(result.content).toContain(cimV2);
    expect(result.content).not.toContain('cim.pdf v1');
    expect(result.citations).toEqual([
      {
        documentId: cimV2,
        documentName: 'cim.pdf',
        version: 2,
        pageFrom: 1,
        pageTo: 1,
        excerpt: 'Revenue was 1.4 million with an EBITDA addback.',
      },
    ]);
  });

  it('searches earlier versions when the model asks for them', async () => {
    const result = await runDocumentTool(
      asUser(owner),
      call('search_documents', {
        query: 'revenue',
        include_earlier_versions: true,
      }),
    );

    expect(result.citations.map((citation) => citation.version).sort()).toEqual(
      [1, 2],
    );
  });

  it('finds nothing in a deal the user cannot read', async () => {
    const result = await runDocumentTool(
      asUser(outsider),
      call('search_documents', { query: 'revenue' }),
    );

    expect(result.content).not.toContain('Revenue');
    expect(result.citations).toEqual([]);
  });

  it('reads pages with their name, version and page citation', async () => {
    const result = await runDocumentTool(
      asUser(owner),
      call('read_document_pages', {
        document_id: cimV2,
        from_page: 1,
        to_page: 3,
      }),
    );

    expect(result.content).toContain('cim.pdf v2, p. 1');
    expect(result.content).toContain('cim.pdf v2, p. 2-3');
    expect(result.content).toContain('Customer list, see Schedule 4.13.');
    expect(result.content).not.toContain('OCR');
    expect(result.citations).toEqual([
      {
        documentId: cimV2,
        documentName: 'cim.pdf',
        version: 2,
        pageFrom: 1,
        pageTo: 1,
        excerpt: 'Revenue was 1.4 million with an EBITDA addback.',
      },
      {
        documentId: cimV2,
        documentName: 'cim.pdf',
        version: 2,
        pageFrom: 2,
        pageTo: 3,
        excerpt: 'Customer list, see Schedule 4.13.',
      },
    ]);
  });

  it('marks OCR text as lower confidence', async () => {
    const result = await runDocumentTool(
      asUser(owner),
      call('read_document_pages', {
        document_id: scan,
        from_page: 1,
        to_page: 1,
      }),
    );

    expect(result.content).toMatch(/OCR/);
    expect(result.content).toContain('Signed lease for the warehouse.');
  });

  it('tells the model a read was cut off and which page to read next', async () => {
    const result = await runDocumentTool(
      asUser(owner),
      call('read_document_pages', {
        document_id: report,
        from_page: 1,
        to_page: 3,
      }),
    );

    expect(result.content).toMatch(/cut off/i);
    expect(result.content).toMatch(/page 2\b/);
    expect(result.content).not.toContain('c'.repeat(10));
    expect(result.citations).toEqual([
      expect.objectContaining({ pageFrom: 1, pageTo: 1 }),
      expect.objectContaining({ pageFrom: 2, pageTo: 2 }),
    ]);
  });

  it('refuses a document the user cannot read', async () => {
    const result = await runDocumentTool(
      asUser(outsider),
      call('read_document_pages', {
        document_id: cimV2,
        from_page: 1,
        to_page: 1,
      }),
    );

    expect(result.isError).toBe(true);
    expect(result.content).not.toContain('Revenue');
    expect(result.citations).toEqual([]);
  });

  it('reads a sheet range and cites the blocks it returned', async () => {
    const result = await runDocumentTool(
      asUser(owner),
      call('read_sheet_range', {
        document_id: model,
        sheet: 'P&L',
        a1_range: 'B2:C10',
      }),
    );

    expect(result.isError).toBeUndefined();
    expect(result.content).toContain('model.xlsx v1, P&L!A1:F40');
    expect(result.content).toContain('P&L rows 1 to 40');
    expect(result.content).not.toContain('P&L rows 41 to 80');
    expect(result.citations).toEqual([
      {
        documentId: model,
        documentName: 'model.xlsx',
        version: 1,
        sheet: 'P&L',
        cellRange: 'A1:F40',
        excerpt: 'P&L rows 1 to 40',
      },
    ]);
  });

  it.each([
    ['an unknown sheet', { sheet: 'Cash flow', a1_range: 'A1:B2' }],
    ['an invalid A1 range', { sheet: 'P&L', a1_range: 'not a range' }],
    ['a range with no cells', { sheet: 'P&L', a1_range: 'Z900:Z901' }],
  ])('returns an error for %s', async (_, input) => {
    const result = await runDocumentTool(
      asUser(owner),
      call('read_sheet_range', { document_id: model, ...input }),
    );

    expect(result.isError).toBe(true);
    expect(result.citations).toEqual([]);
  });

  it('lists the latest documents with their ids', async () => {
    const result = await runDocumentTool(
      asUser(owner),
      call('list_documents', {}),
    );

    expect(result.content).toContain(cimV2);
    expect(result.content).not.toContain(cimV1);
    expect(result.content).toContain('model.xlsx');
    expect(result.citations).toEqual([]);
  });

  it('lists no documents in a deal the user cannot read', async () => {
    const result = await runDocumentTool(
      asUser(outsider),
      call('list_documents', {}),
    );

    expect(result.content).toBe('No documents.');
  });

  it('lists the sheets of a workbook with their used ranges', async () => {
    const result = await runDocumentTool(
      asUser(owner),
      call('list_sheets', { document_id: model }),
    );

    expect(result.content).toContain('P&L');
    expect(result.content).toContain('A1:F80');
    expect(result.content).toContain('Balance sheet');
  });

  it('marks OCR search snippets as lower confidence and leaves others unmarked', async () => {
    const lease = await runDocumentTool(
      asUser(owner),
      call('search_documents', { query: 'lease' }),
    );
    const revenue = await runDocumentTool(
      asUser(owner),
      call('search_documents', { query: 'revenue' }),
    );

    expect(lease.content).toContain(
      '[scan.pdf v1, p. 1] (OCR text, lower confidence)',
    );
    expect(revenue.content).not.toContain('OCR');
  });

  it('finds answered questions on this deal, not failed ones or other deals, and makes none of them citable', async () => {
    const result = await runDocumentTool(
      asUser(owner),
      call('search_past_answers', { query: 'warranty' }),
    );

    expect(result.isError).toBeUndefined();
    expect(result.content).toContain('What is the warranty period?');
    expect(result.content).toContain(
      'The warranty runs two years [cim.pdf v2, p. 2-3].',
    );
    expect(result.content).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(result.content).not.toContain('Who signs the warranty?');
    expect(result.content).not.toContain('Does the warranty transfer?');
    expect(result.content.split('\n').at(-1)).toMatch(
      /not sources.*read the documents again/i,
    );
    expect(result.citations).toEqual([]);
  });

  it('finds no past answers on a deal the user cannot read', async () => {
    const result = await runDocumentTool(
      asUser(outsider),
      call('search_past_answers', { query: 'warranty' }),
    );

    expect(result).toEqual({ content: 'No earlier answers.', citations: [] });
  });

  it('says so when no past answer matches', async () => {
    const result = await runDocumentTool(
      asUser(owner),
      call('search_past_answers', { query: 'zebra' }),
    );

    expect(result).toEqual({ content: 'No earlier answers.', citations: [] });
  });

  it('says so when a search matches nothing', async () => {
    const result = await runDocumentTool(
      asUser(owner),
      call('search_documents', { query: 'zebra' }),
    );

    expect(result).toEqual({ content: 'No matches.', citations: [] });
  });

  it('says so when a document has no sheets', async () => {
    const result = await runDocumentTool(
      asUser(owner),
      call('list_sheets', { document_id: cimV2 }),
    );

    expect(result).toEqual({
      content: 'cim.pdf has no sheets.',
      citations: [],
    });
  });

  it('refuses a readable document from another deal', async () => {
    const result = await runDocumentTool(
      asUser(owner),
      call('read_document_pages', {
        document_id: elsewhere,
        from_page: 1,
        to_page: 1,
      }),
    );

    expect(result).toEqual({
      content: `No document ${elsewhere} in this deal.`,
      isError: true,
      citations: [],
    });
  });

  it('refuses pages with no text', async () => {
    const result = await runDocumentTool(
      asUser(owner),
      call('read_document_pages', {
        document_id: cimV2,
        from_page: 50,
        to_page: 60,
      }),
    );

    expect(result).toEqual({
      content: 'cim.pdf has no text on pages 50-60.',
      isError: true,
      citations: [],
    });
  });

  it.each([
    ['an unknown tool', call('delete_documents', {})],
    ['a missing argument', call('search_documents', {})],
    [
      'a mistyped argument',
      call('read_document_pages', {
        document_id: cimV2,
        from_page: '1',
        to_page: 2,
      }),
    ],
    ['arguments that are not an object', call('list_documents', 'everything')],
    ['arguments that are an array', call('list_documents', [])],
    [
      'a document id that is not a uuid',
      call('list_sheets', { document_id: 'cim.pdf' }),
    ],
    [
      'an argument the tool does not take',
      call('list_documents', { deal_id: 'another-deal' }),
    ],
  ])('returns an error for %s', async (_, toolCall) => {
    const result = await runDocumentTool(asUser(owner), toolCall);

    expect(result.isError).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.citations).toEqual([]);
  });
});
