import { WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { utils, write } from 'xlsx';

import {
  appendDealEvent,
  type IntegrationAccount,
  provisionAccount,
  seedDeal,
} from '../../test-support/integration-harness';
import type { DoclingDocument, DoclingPass } from './docling';

import { createHash } from 'node:crypto';

const fakes = vi.hoisted(() => ({
  convertFile: vi.fn(),
  started: [] as { workflowId: string; args: unknown[] }[],
  heartbeats: 0,
  whileStarting: () => {},
}));

vi.mock('@temporalio/activity', () => ({
  Context: {
    current: () => ({
      heartbeat: () => {
        fakes.heartbeats += 1;
      },
    }),
  },
}));

vi.mock('./docling', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./docling')>()),
  convertFile: fakes.convertFile,
}));

vi.mock('../client', () => ({
  getTemporalClient: async () => ({
    workflow: {
      start: async (
        _type: string,
        options: { workflowId: string; args: unknown[] },
      ) => {
        fakes.whileStarting();
        if (
          fakes.started.some((run) => run.workflowId === options.workflowId)
        ) {
          throw new WorkflowExecutionAlreadyStartedError(
            'already started',
            options.workflowId,
            'documentIngestion',
          );
        }
        fakes.started.push(options);
      },
    },
  }),
}));

const {
  extractDocumentSegments,
  fetchAddedDocuments,
  startDocumentIngestion,
  startMissingDocumentIngestions,
} = await import('./ingestion');

function pagesDocument(
  pass: DoclingPass,
  textByPage: Record<number, string>,
): DoclingDocument {
  const texts = Object.entries(textByPage).map(([page, text], index) => ({
    self_ref: `#/texts/${index}`,
    label: 'text',
    text: pass.ocr === 'force' ? `${text} (OCR)` : text,
    prov: [{ page_no: Number(page) }],
    children: [],
  }));
  return {
    body: {
      self_ref: '#/body',
      label: 'unspecified',
      children: texts.map((text) => ({ $ref: text.self_ref })),
    },
    groups: [],
    tables: [],
    pictures: [],
    texts,
    pages: Object.fromEntries(
      Object.keys(textByPage).map((page) => [page, { page_no: Number(page) }]),
    ),
  };
}

let team: IntegrationAccount;
let unconnected: IntegrationAccount;
let dealId: string;
let unconnectedDealId: string;
const leaseBytes = new TextEncoder().encode('%PDF-1.7 Harbor Lane lease');
const leaseHash = createHash('sha256').update(leaseBytes).digest('hex');

async function addDocument(
  account: IntegrationAccount,
  deal: string,
  name: string,
  bytes: Uint8Array,
  version = 1,
): Promise<string> {
  const { data: folder } = await account.admin
    .from('dr_folder')
    .insert({
      account_id: account.accountId,
      deal_id: deal,
      name: `Folder ${name}`,
    })
    .select('id')
    .single()
    .throwOnError();
  const documentId = crypto.randomUUID();
  const storagePath = `deal/${deal}/${documentId}/${name}`;
  const { error } = await account.admin.storage
    .from('data-room')
    .upload(storagePath, bytes);
  if (error) {
    throw error;
  }
  await appendDealEvent(account.admin, {
    dealId: deal,
    aggregateType: 'dr_document',
    aggregateId: documentId,
    eventType: 'dr_document.added',
    payload: { folder_id: folder.id, name, storage_path: storagePath, version },
  });
  return documentId;
}

async function segmentsOf(documentId: string) {
  const { data } = await team.admin
    .from('document_segment')
    .select(
      'id, segment_index, kind, page_from, page_to, sheet, cell_range, text, formulas, from_ocr, document_version, content_hash',
    )
    .eq('dr_document_id', documentId)
    .order('segment_index')
    .throwOnError();
  return data;
}

beforeAll(async () => {
  process.env.DOCLING_URL = 'http://docling.test';
  process.env.DOCLING_API_KEY = 'dk';
  [team, unconnected] = await Promise.all([
    provisionAccount(),
    provisionAccount(),
  ]);
  await team.user
    .rpc('save_llm_endpoint', {
      p_account_id: team.accountId,
      p_provider: 'openai_compatible',
      p_model: 'team-chat',
      p_base_url: 'https://provider.example.com/v1',
      p_api_key: 'sk-vault',
      p_embedding_model: 'team-embed',
      p_input_price_per_mtok: 1,
      p_cached_input_price_per_mtok: 1,
      p_output_price_per_mtok: 1,
    })
    .throwOnError();
  dealId = await seedDeal(team.admin, team.accountId, team.userId, {
    description: 'Harbor Lane Bakery',
  });
  unconnectedDealId = await seedDeal(
    unconnected.admin,
    unconnected.accountId,
    unconnected.userId,
    { description: 'Juniper Florist' },
  );
});

afterAll(async () => {
  await team.admin.from('accounts').delete().eq('id', team.accountId);
  await unconnected.admin
    .from('accounts')
    .delete()
    .eq('id', unconnected.accountId);
  await Promise.all([team.cleanup(), unconnected.cleanup()]);
});

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  fakes.started.length = 0;
  fakes.heartbeats = 0;
  fakes.whileStarting = () => {};
  fakes.convertFile.mockReset();
  fakes.convertFile.mockImplementation(
    async (
      _config: unknown,
      _bytes: Uint8Array,
      _name: string,
      pass: DoclingPass,
    ) =>
      pagesDocument(pass, { 1: 'Lease term ten years', 2: 'Base rent $4,200' }),
  );
});

describe('extractDocumentSegments', () => {
  it('writes a page segment per page with the version, file hash and OCR flag, and converges when run again', async () => {
    const documentId = await addDocument(
      team,
      dealId,
      'Lease.pdf',
      leaseBytes,
      2,
    );

    await extractDocumentSegments({
      drDocumentId: documentId,
      forceOcr: false,
    });
    const first = await segmentsOf(documentId);
    await extractDocumentSegments({
      drDocumentId: documentId,
      forceOcr: false,
    });

    const page = (index: number, from: number, text: string) => ({
      id: expect.any(String),
      segment_index: index,
      kind: 'page',
      page_from: from,
      page_to: from,
      sheet: null,
      cell_range: null,
      text,
      formulas: null,
      from_ocr: false,
      document_version: 2,
      content_hash: leaseHash,
    });
    expect(first).toEqual([
      page(0, 1, 'Lease term ten years'),
      page(1, 2, 'Base rent $4,200'),
    ]);
    expect(await segmentsOf(documentId)).toEqual(first);
  });

  it('heartbeats through a slow conversion and stops once it is done, so a crashed worker is noticed', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const documentId = await addDocument(
      team,
      dealId,
      'Slow lease.pdf',
      new TextEncoder().encode('%PDF-1.7 a lease Docling takes minutes on'),
    );
    const convert = fakes.convertFile.getMockImplementation()!;
    let beatsWhileConverting = 0;
    fakes.convertFile.mockImplementation(async (...args: unknown[]) => {
      const before = fakes.heartbeats;
      vi.advanceTimersByTime(60_000);
      beatsWhileConverting += fakes.heartbeats - before;
      return convert(...args);
    });

    await extractDocumentSegments({
      drDocumentId: documentId,
      forceOcr: false,
    });
    const beatsWhenDone = fakes.heartbeats;
    vi.advanceTimersByTime(60_000);

    expect(beatsWhileConverting).toBeGreaterThan(0);
    expect(fakes.heartbeats).toBe(beatsWhenDone);
  });

  it('copies the extraction of an identical file in the team instead of converting it again', async () => {
    const original = await addDocument(team, dealId, 'Lease.pdf', leaseBytes);
    await extractDocumentSegments({ drDocumentId: original, forceOcr: false });
    fakes.convertFile.mockClear();
    const reupload = await addDocument(
      team,
      dealId,
      'Lease copy.pdf',
      leaseBytes,
      3,
    );

    await extractDocumentSegments({ drDocumentId: reupload, forceOcr: false });

    expect(fakes.convertFile).not.toHaveBeenCalled();
    expect(
      (await segmentsOf(reupload)).map((segment) => [
        segment.text,
        segment.document_version,
      ]),
    ).toEqual([
      ['Lease term ten years', 3],
      ['Base rent $4,200', 3],
    ]);
  });

  it('replaces the segments with full-page OCR when re-run with OCR forced, dropping pages it no longer has', async () => {
    const documentId = await addDocument(
      team,
      dealId,
      'Signed.pdf',
      leaseBytes,
    );
    await extractDocumentSegments({
      drDocumentId: documentId,
      forceOcr: false,
    });
    fakes.convertFile.mockImplementation(
      async (
        _config: unknown,
        _bytes: Uint8Array,
        _name: string,
        pass: DoclingPass,
      ) => pagesDocument(pass, { 1: 'Signed lease' }),
    );

    await extractDocumentSegments({ drDocumentId: documentId, forceOcr: true });

    expect(
      (await segmentsOf(documentId)).map((segment) => [
        segment.text,
        segment.from_ocr,
      ]),
    ).toEqual([['Signed lease (OCR)', true]]);
  });

  it('ends quietly with nothing written when the document is gone', async () => {
    const gone = crypto.randomUUID();

    expect(
      await extractDocumentSegments({ drDocumentId: gone, forceOcr: false }),
    ).toBeNull();
    expect(await segmentsOf(gone)).toEqual([]);
  });

  it('writes sheet blocks for a workbook', async () => {
    const book = utils.book_new();
    utils.book_append_sheet(
      book,
      utils.aoa_to_sheet([
        ['Year', 'Revenue'],
        [2024, 1388000],
      ]),
      'P&L',
    );
    const documentId = await addDocument(
      team,
      dealId,
      'Financials.xlsx',
      new Uint8Array(write(book, { type: 'array', bookType: 'xlsx' })),
    );

    await extractDocumentSegments({
      drDocumentId: documentId,
      forceOcr: false,
    });

    expect(await segmentsOf(documentId)).toMatchObject([
      {
        kind: 'sheet_block',
        sheet: 'P&L',
        cell_range: 'A2:B2',
        page_from: null,
        from_ocr: false,
      },
    ]);
  });
});

describe('startDocumentIngestion', () => {
  it('starts one ingestion per readable document of a team with AI connected, and a repeat is a no-op', async () => {
    const lease = await addDocument(team, dealId, 'Lease.pdf', leaseBytes);
    const archive = await addDocument(
      team,
      dealId,
      'Closing set.zip',
      leaseBytes,
    );
    const florist = await addDocument(
      unconnected,
      unconnectedDealId,
      'Florist lease.pdf',
      leaseBytes,
    );

    for (const drDocumentId of [lease, lease, archive, florist]) {
      await startDocumentIngestion({ drDocumentId });
    }

    expect(fakes.started).toEqual([
      expect.objectContaining({
        workflowId: `ingest-${lease}`,
        args: [{ drDocumentId: lease }],
      }),
    ]);
  });

  it('ends quietly without starting anything when the document is gone', async () => {
    await startDocumentIngestion({ drDocumentId: crypto.randomUUID() });

    expect(fakes.started).toEqual([]);
  });
});

describe('ingestion before Docling is configured', () => {
  afterEach(() => {
    process.env.DOCLING_URL = 'http://docling.test';
    process.env.DOCLING_API_KEY = 'dk';
  });

  it('holds back files only Docling reads, with one log line each, starts the rest, and the backfill starts the held-back ones once Docling is configured', async () => {
    delete process.env.DOCLING_URL;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const needsDocling = [
      await addDocument(team, dealId, 'Waiting lease.pdf', leaseBytes),
      await addDocument(team, dealId, 'Waiting memo.docx', leaseBytes),
      await addDocument(team, dealId, 'Waiting deck.pptx', leaseBytes),
      await addDocument(team, dealId, 'Waiting scan.png', leaseBytes),
    ];
    const readable = [
      await addDocument(team, dealId, 'Notes.txt', leaseBytes),
      await addDocument(team, dealId, 'Rent roll.csv', leaseBytes),
      await addDocument(team, dealId, 'Budget.xlsx', leaseBytes),
      await addDocument(team, dealId, 'Old budget.xls', leaseBytes),
    ];

    for (const drDocumentId of [...needsDocling, ...readable]) {
      await startDocumentIngestion({ drDocumentId });
    }
    await startMissingDocumentIngestions({ accountId: team.accountId });
    const startedWithoutDocling = fakes.started.map((run) => run.workflowId);
    const doclingLogs = warn.mock.calls.length;
    warn.mockRestore();

    process.env.DOCLING_URL = 'http://docling.test';
    await startMissingDocumentIngestions({ accountId: team.accountId });
    const started = fakes.started.map((run) => run.workflowId);

    for (const id of readable) {
      expect(startedWithoutDocling).toContain(`ingest-${id}`);
    }
    for (const id of needsDocling) {
      expect(startedWithoutDocling).not.toContain(`ingest-${id}`);
      expect(started).toContain(`ingest-${id}`);
    }
    expect(doclingLogs).toBe(needsDocling.length);
  });
});

describe('fetchAddedDocuments', () => {
  it('lists added documents after the cursor in order', async () => {
    const { data: latest } = await team.admin
      .from('deal_event')
      .select('global_seq')
      .order('global_seq', { ascending: false })
      .limit(1)
      .single()
      .throwOnError();
    const first = await addDocument(team, dealId, 'One.pdf', leaseBytes);
    const second = await addDocument(team, dealId, 'Two.pdf', leaseBytes);

    const added = await fetchAddedDocuments({
      afterGlobalSeq: latest.global_seq,
      limit: 100,
    });

    expect(added.map((event) => event.drDocumentId)).toEqual([first, second]);
    expect(added[0]!.globalSeq).toBeLessThan(added[1]!.globalSeq);
  });
});

describe('startMissingDocumentIngestions', () => {
  it('starts every live readable document of a team with AI connected that was never ingested, leaving failed ones alone', async () => {
    const missed = await addDocument(team, dealId, 'Missed.docx', leaseBytes);
    const ingested = await addDocument(
      team,
      dealId,
      'Ingested.pdf',
      leaseBytes,
    );
    const failed = await addDocument(team, dealId, 'Corrupt.pdf', leaseBytes);
    await team.admin
      .from('embedding_job')
      .insert([
        {
          account_id: team.accountId,
          deal_id: dealId,
          dr_document_id: ingested,
          status: 'done',
        },
        {
          account_id: team.accountId,
          deal_id: dealId,
          dr_document_id: failed,
          status: 'failed',
          error: 'docling conversion t1 failed',
        },
      ])
      .throwOnError();
    const removed = await addDocument(team, dealId, 'Removed.pdf', leaseBytes);
    await appendDealEvent(team.admin, {
      dealId,
      aggregateType: 'dr_document',
      aggregateId: removed,
      eventType: 'dr_document.removed',
    });
    const florist = await addDocument(
      unconnected,
      unconnectedDealId,
      'Florist lease.pdf',
      leaseBytes,
    );

    await startMissingDocumentIngestions({});

    const startedIds = fakes.started.map((run) => run.workflowId);
    expect(startedIds).toContain(`ingest-${missed}`);
    for (const skipped of [ingested, failed, removed, florist]) {
      expect(startedIds).not.toContain(`ingest-${skipped}`);
    }
  });

  it('heartbeats through a slow backfill and stops once it is done, so a crashed worker is noticed', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await addDocument(team, dealId, 'Backlog.pdf', leaseBytes);
    let beatsWhileStarting = 0;
    fakes.whileStarting = () => {
      const before = fakes.heartbeats;
      vi.advanceTimersByTime(60_000);
      beatsWhileStarting += fakes.heartbeats - before;
    };

    await startMissingDocumentIngestions({ accountId: team.accountId });
    const beatsWhenDone = fakes.heartbeats;
    vi.advanceTimersByTime(60_000);

    expect(beatsWhileStarting).toBeGreaterThan(0);
    expect(fakes.heartbeats).toBe(beatsWhenDone);
  });

  it('limits a backfill to the team that just connected AI', async () => {
    const otherTeam = await provisionAccount();
    await otherTeam.user
      .rpc('save_llm_endpoint', {
        p_account_id: otherTeam.accountId,
        p_provider: 'openai_compatible',
        p_model: 'team-chat',
        p_base_url: 'https://provider.example.com/v1',
        p_api_key: 'sk-other',
        p_embedding_model: 'team-embed',
        p_input_price_per_mtok: 1,
        p_cached_input_price_per_mtok: 1,
        p_output_price_per_mtok: 1,
      })
      .throwOnError();
    const otherDeal = await seedDeal(
      otherTeam.admin,
      otherTeam.accountId,
      otherTeam.userId,
      { description: 'Cedar Dental' },
    );
    const otherDocument = await addDocument(
      otherTeam,
      otherDeal,
      'Dental lease.pdf',
      leaseBytes,
    );
    const teamDocument = await addDocument(
      team,
      dealId,
      'Payroll.pdf',
      leaseBytes,
    );

    await startMissingDocumentIngestions({ accountId: team.accountId });

    const startedIds = fakes.started.map((run) => run.workflowId);
    expect(startedIds).toContain(`ingest-${teamDocument}`);
    expect(startedIds).not.toContain(`ingest-${otherDocument}`);

    await otherTeam.admin
      .from('accounts')
      .delete()
      .eq('id', otherTeam.accountId);
    await otherTeam.cleanup();
  });
});
