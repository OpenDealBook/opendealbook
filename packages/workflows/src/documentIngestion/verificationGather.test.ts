import { beforeEach, describe, expect, it, vi } from 'vitest';

const collaborators = vi.hoisted(() => ({
  extractMarkdown: vi.fn(),
  extractFigure: vi.fn(),
}));

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
    llm_endpoint: {
      id: 'ep1',
      chat_model: 'gpt-4o-mini',
      base_url: 'http://llm.test',
      api_key_secret_ref: 'TENANT_LLM_KEY',
    },
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
  return capture.inserts.filter((row) => row.table === table).map((r) => r.rows);
}

beforeEach(() => {
  process.env.TENANT_LLM_KEY = 'sk-tenant';
  collaborators.extractMarkdown.mockReset();
  collaborators.extractFigure.mockReset();
  collaborators.extractMarkdown.mockResolvedValue('# doc markdown');
});

describe('buildDocumentExtractionChecks', () => {
  it('selects the W-2 and 941 documents, extracts via Docling then the LLM, and maps them to the payroll input', async () => {
    const { client, capture } = makeClient({
      documents: [
        { id: 'd_w2', name: 'W-2 2024.pdf', storage_path: 'p/w2', checklist_item_id: 'c1' },
        { id: 'd_941', name: 'Form 941 Q1.pdf', storage_path: 'p/941', checklist_item_id: null },
      ],
    });
    collaborators.extractFigure
      .mockResolvedValueOnce({ amount: 100000, promptTokens: 20, completionTokens: 3 })
      .mockResolvedValueOnce({ amount: 98000, promptTokens: 22, completionTokens: 4 });

    const checks = await buildDocumentExtractionChecks({
      client: client as never,
      dealId: 'deal1',
      docling: { baseUrl: 'http://docling.test', apiKey: 'x' },
    });

    const payroll = checks.find((c) => c.check.key === 'payroll_tax_vs_w2')!;
    const input = (await payroll.gather({ dealId: 'deal1', period: '2024' })) as {
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

    const logs = inserted(capture, 'ai_call_log') as Array<Record<string, unknown>>;
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({
      account_id: 'acct1',
      deal_id: 'deal1',
      model: 'gpt-4o-mini',
    });
  });

  it('drives the payroll check to a missing error finding when no W-2 document is present', async () => {
    const { client } = makeClient({
      documents: [
        { id: 'd_941', name: 'Form 941 Q1.pdf', storage_path: 'p/941', checklist_item_id: null },
      ],
    });
    collaborators.extractFigure.mockResolvedValue({
      amount: 98000,
      promptTokens: 10,
      completionTokens: 2,
    });

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
        { id: 'd_cim', name: 'Marketing CIM.pdf', storage_path: 'p/cim', checklist_item_id: null },
      ],
    });
    collaborators.extractFigure.mockResolvedValue({
      amount: 500000,
      promptTokens: 10,
      completionTokens: 2,
    });

    const checks = await buildDocumentExtractionChecks({
      client: client as never,
      dealId: 'deal1',
      docling: { baseUrl: 'http://docling.test', apiKey: 'x' },
    });

    const revenue = checks.find((c) => c.check.key === 'revenue_vs_dd_financials')!;
    const input = await revenue.gather({ dealId: 'deal1', period: '2024' });
    const findings = revenue.check.evaluate(input);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'error', status: 'missing' });
  });

  it('is a logged no-op (no checks) when the docling endpoint is not configured', async () => {
    const { client } = makeClient({
      documents: [
        { id: 'd_w2', name: 'W-2 2024.pdf', storage_path: 'p/w2', checklist_item_id: 'c1' },
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

  it('is a logged no-op when the tenant llm endpoint api key is absent from the environment', async () => {
    delete process.env.TENANT_LLM_KEY;
    const { client } = makeClient({
      documents: [
        { id: 'd_w2', name: 'W-2 2024.pdf', storage_path: 'p/w2', checklist_item_id: 'c1' },
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
        { id: 'd_941', name: 'Form 941 Q1.pdf', storage_path: 'p/941', checklist_item_id: null },
      ],
    });
    collaborators.extractFigure.mockResolvedValue({
      amount: 98000,
      promptTokens: 10,
      completionTokens: 2,
    });

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
});
