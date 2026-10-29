import { beforeEach, describe, expect, it, vi } from 'vitest';

const collaborators = vi.hoisted(() => ({
  extractMarkdown: vi.fn(),
  extractFigure: vi.fn(),
}));

const team = vi.hoisted(() => ({
  apiKey: null as string | null,
}));

vi.mock('@odb/supabase/admin', () => {
  const settled = (data: unknown) => ({ throwOnError: async () => ({ data, error: null }) });
  return {
    getSupabaseServerAdminClient: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              settled({
                id: 'ep1',
                provider: 'openai_compatible',
                model: null,
                chat_model: 'gpt-4o-mini',
                base_url: 'http://llm.test',
              }),
          }),
        }),
      }),
      rpc: () => settled(team.apiKey),
    }),
  };
});

vi.mock('./docling', () => ({
  extractMarkdown: collaborators.extractMarkdown,
}));

vi.mock('./extraction', () => ({
  extractFigure: collaborators.extractFigure,
}));

import { runVerification } from '@odb/verification';

import { buildDocumentExtractionChecks } from './verificationGather';

interface FakeConfig {
  documents?: Array<Record<string, unknown>>;
  checklistItems?: Array<Record<string, unknown>>;
}

function makeClient(config: FakeConfig) {
  const capture = {
    inserts: [] as Array<{ table: string; rows: unknown }>,
    updates: [] as Array<{ table: string; payload: unknown }>,
  };

  const lists: Record<string, unknown[]> = {
    dr_document: config.documents ?? [],
    checklist_item: config.checklistItems ?? [],
  };

  const singles: Record<string, unknown> = {
    deal: { account_id: 'acct1', owner_user_id: 'owner1' },
  };

  const insertReturn: Record<string, unknown> = {
    verification_run: { id: 'run1' },
  };

  const client = {
    from(table: string) {
      const listResult = { data: lists[table] ?? [], error: null };
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        limit: () => builder,
        order: () => builder,
        single: async () => ({ data: singles[table] ?? null, error: null }),
        insert(rows: unknown) {
          capture.inserts.push({ table, rows });
          const result = { data: insertReturn[table] ?? null, error: null };
          return {
            select: () => ({ single: async () => result }),
            then: (resolve: (value: { error: null }) => unknown) =>
              resolve({ error: null }),
          };
        },
        update(payload: unknown) {
          capture.updates.push({ table, payload });
          return { eq: async () => ({ error: null }) };
        },
        then: (resolve: (value: unknown) => unknown) => resolve(listResult),
      };
      return builder;
    },
    storage: {
      from: () => ({
        createSignedUrl: async () => ({
          data: { signedUrl: 'http://signed' },
          error: null,
        }),
      }),
    },
  };

  return { client, capture };
}

function inserted(
  capture: ReturnType<typeof makeClient>['capture'],
  table: string,
): unknown[] {
  return capture.inserts
    .filter((row) => row.table === table)
    .map((r) => r.rows);
}

beforeEach(() => {
  team.apiKey = 'sk-vault';
  collaborators.extractMarkdown.mockReset();
  collaborators.extractFigure.mockReset();
  collaborators.extractMarkdown.mockResolvedValue('# doc markdown');
});

describe('buildDocumentExtractionChecks', () => {
  it('selects the W-2 and 941 documents, extracts via Docling then the LLM, and maps them to the payroll input', async () => {
    const { client, capture } = makeClient({
      documents: [
        {
          id: 'd_w2',
          name: 'W-2 2024.pdf',
          storage_path: 'p/w2',
        },
        {
          id: 'd_941',
          name: 'Form 941 Q1.pdf',
          storage_path: 'p/941',
        },
      ],
    });
    collaborators.extractFigure.mockResolvedValueOnce(100000).mockResolvedValueOnce(98000);

    const checks = await buildDocumentExtractionChecks({
      client: client as never,
      dealId: 'deal1',
      docling: { baseUrl: 'http://docling.test', apiKey: 'x' },
    });

    const payroll = checks.find((c) => c.check.key === 'payroll_tax_vs_w2')!;
    const input = (await payroll.gather({
      dealId: 'deal1',
      period: '2024',
    })) as {
      w2WagesTotal: number | null;
      payrollTaxWagesTotal: number | null;
    };

    expect(input.w2WagesTotal).toBe(100000);
    expect(input.payrollTaxWagesTotal).toBe(98000);
    expect(collaborators.extractMarkdown).toHaveBeenCalledWith(
      { baseUrl: 'http://docling.test', apiKey: 'x' },
      'http://signed',
    );
    expect(collaborators.extractFigure).toHaveBeenCalledTimes(2);

    expect(inserted(capture, 'ai_call_log')).toEqual([]);
  });

  it("extracts with the team's chat AI for the deal", async () => {
    const { client } = makeClient({
      documents: [{ id: 'd_w2', name: 'W-2 2024.pdf', storage_path: 'p/w2' }],
    });
    collaborators.extractMarkdown.mockResolvedValue('Employee Priya Okafor, wages 100000');
    collaborators.extractFigure.mockResolvedValue(100000);

    const checks = await buildDocumentExtractionChecks({
      client: client as never,
      dealId: 'deal1',
      docling: { baseUrl: 'http://docling.test', apiKey: 'x' },
    });
    await checks.find((c) => c.check.key === 'payroll_tax_vs_w2')!.gather({ dealId: 'deal1', period: '2024' });

    expect(collaborators.extractFigure).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'acct1', model: 'gpt-4o-mini', apiKey: 'sk-vault' }),
      'deal1',
      expect.any(String),
      'Employee Priya Okafor, wages 100000',
    );
  });

  it('finds a document through the checklist item that links it and names that item', async () => {
    const { client } = makeClient({
      documents: [
        { id: 'd_scan', name: 'scan-001.pdf', storage_path: 'p/scan' },
        { id: 'd_941', name: 'Form 941 Q1.pdf', storage_path: 'p/941' },
      ],
      checklistItems: [
        {
          id: 'c1',
          category: null,
          title: 'W-2 forms',
          linked_document_id: 'd_scan',
        },
      ],
    });
    collaborators.extractFigure.mockResolvedValue(100000);

    const checks = await buildDocumentExtractionChecks({
      client: client as never,
      dealId: 'deal1',
      docling: { baseUrl: 'http://docling.test', apiKey: 'x' },
    });

    const payroll = checks.find((c) => c.check.key === 'payroll_tax_vs_w2')!;
    const input = (await payroll.gather({
      dealId: 'deal1',
      period: '2024',
    })) as {
      w2WagesTotal: number | null;
      links: Record<string, string>;
    };

    expect(input.w2WagesTotal).toBe(100000);
    expect(input.links).toEqual({
      drDocumentId: 'd_scan',
      checklistItemIds: ['c1'],
    });
  });

  it('matches a document by every checklist item that links it', async () => {
    const { client } = makeClient({
      documents: [
        { id: 'd_scan', name: 'scan-001.pdf', storage_path: 'p/scan' },
        { id: 'd_941', name: 'Form 941 Q1.pdf', storage_path: 'p/941' },
      ],
      checklistItems: [
        {
          id: 'c2',
          category: null,
          title: 'W-2 forms',
          linked_document_id: 'd_scan',
        },
        {
          id: 'c1',
          category: null,
          title: 'Bank statements',
          linked_document_id: 'd_scan',
        },
      ],
    });
    collaborators.extractFigure.mockResolvedValue(100000);

    const checks = await buildDocumentExtractionChecks({
      client: client as never,
      dealId: 'deal1',
      docling: { baseUrl: 'http://docling.test', apiKey: 'x' },
    });

    const payroll = checks.find((c) => c.check.key === 'payroll_tax_vs_w2')!;
    const input = (await payroll.gather({
      dealId: 'deal1',
      period: '2024',
    })) as {
      w2WagesTotal: number | null;
    };

    expect(input.w2WagesTotal).toBe(100000);
  });

  it('drives the payroll check to a missing error finding when no W-2 document is present', async () => {
    const { client } = makeClient({
      documents: [
        {
          id: 'd_941',
          name: 'Form 941 Q1.pdf',
          storage_path: 'p/941',
        },
      ],
    });
    collaborators.extractFigure.mockResolvedValue(98000);

    const checks = await buildDocumentExtractionChecks({
      client: client as never,
      dealId: 'deal1',
      docling: { baseUrl: 'http://docling.test', apiKey: 'x' },
    });

    const payroll = checks.find((c) => c.check.key === 'payroll_tax_vs_w2')!;
    const input = await payroll.gather({ dealId: 'deal1', period: '2024' });
    const findings = payroll.check.evaluate(input);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'error', status: 'missing' });
  });

  it('drives the revenue check to a missing error finding when no DD financials document is present', async () => {
    const { client } = makeClient({
      documents: [
        {
          id: 'd_cim',
          name: 'Marketing CIM.pdf',
          storage_path: 'p/cim',
        },
      ],
    });
    collaborators.extractFigure.mockResolvedValue(500000);

    const checks = await buildDocumentExtractionChecks({
      client: client as never,
      dealId: 'deal1',
      docling: { baseUrl: 'http://docling.test', apiKey: 'x' },
    });

    const revenue = checks.find(
      (c) => c.check.key === 'revenue_vs_dd_financials',
    )!;
    const input = await revenue.gather({ dealId: 'deal1', period: '2024' });
    const findings = revenue.check.evaluate(input);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'error', status: 'missing' });
  });

  it('is a logged no-op (no checks) when the docling endpoint is not configured', async () => {
    const { client } = makeClient({
      documents: [
        {
          id: 'd_w2',
          name: 'W-2 2024.pdf',
          storage_path: 'p/w2',
        },
      ],
    });

    const checks = await buildDocumentExtractionChecks({
      client: client as never,
      dealId: 'deal1',
      docling: null,
    });

    expect(checks).toEqual([]);
    expect(collaborators.extractMarkdown).not.toHaveBeenCalled();
  });

  it('is a logged no-op when the team has no AI provider key', async () => {
    team.apiKey = null;
    const { client } = makeClient({
      documents: [
        {
          id: 'd_w2',
          name: 'W-2 2024.pdf',
          storage_path: 'p/w2',
        },
      ],
    });

    const checks = await buildDocumentExtractionChecks({
      client: client as never,
      dealId: 'deal1',
      docling: { baseUrl: 'http://docling.test', apiKey: 'x' },
    });

    expect(checks).toEqual([]);
    expect(collaborators.extractMarkdown).not.toHaveBeenCalled();
  });

  it('runs end-to-end through runVerification and persists the missing-document finding', async () => {
    const { client, capture } = makeClient({
      documents: [
        {
          id: 'd_941',
          name: 'Form 941 Q1.pdf',
          storage_path: 'p/941',
        },
      ],
    });
    collaborators.extractFigure.mockResolvedValue(98000);

    const runnableChecks = await buildDocumentExtractionChecks({
      client: client as never,
      dealId: 'deal1',
      docling: { baseUrl: 'http://docling.test', apiKey: 'x' },
    });

    const result = await runVerification({
      client: client as never,
      dealId: 'deal1',
      trigger: 'ingest',
      runnableChecks,
      notify: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.status).toBe('done');
    const findingRows = inserted(capture, 'verification_finding') as Array<
      Array<Record<string, unknown>>
    >;
    expect(findingRows).toHaveLength(1);
    const rows = findingRows[0]!;
    expect(rows.some((row) => row.severity === 'error')).toBe(true);
  });

  it('names every checklist item that links the document on the persisted finding', async () => {
    const { client, capture } = makeClient({
      documents: [
        { id: 'd_scan', name: 'scan-001.pdf', storage_path: 'p/scan' },
        { id: 'd_941', name: 'Form 941 Q1.pdf', storage_path: 'p/941' },
      ],
      checklistItems: [
        {
          id: 'c2',
          category: null,
          title: 'W-2 forms',
          linked_document_id: 'd_scan',
        },
        {
          id: 'c1',
          category: null,
          title: 'Bank statements',
          linked_document_id: 'd_scan',
        },
      ],
    });
    collaborators.extractFigure.mockResolvedValue(100000);

    const runnableChecks = await buildDocumentExtractionChecks({
      client: client as never,
      dealId: 'deal1',
      docling: { baseUrl: 'http://docling.test', apiKey: 'x' },
    });
    await runVerification({
      client: client as never,
      dealId: 'deal1',
      trigger: 'ingest',
      runnableChecks: runnableChecks.filter(
        (c) => c.check.key === 'payroll_tax_vs_w2',
      ),
      notify: vi.fn().mockResolvedValue(undefined),
    });

    const [rows] = inserted(capture, 'verification_finding') as Array<
      Array<Record<string, unknown>>
    >;
    expect(rows).toEqual([
      expect.objectContaining({
        dr_document_id: 'd_scan',
        checklist_item_ids: ['c2', 'c1'],
      }),
    ]);
  });
});
