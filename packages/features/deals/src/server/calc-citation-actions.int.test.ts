import { createClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Database } from '@odb/supabase';

import {
  type IntegrationAccount,
  provisionAccount,
} from '../../test-support/integration-harness';

const holder = vi.hoisted(() => ({
  client: null as unknown,
  userId: '',
}));

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (data: unknown, user: { id: string }) => unknown) =>
    (data: unknown, user?: { id: string }) =>
      fn(data, user ?? { id: holder.userId }),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => holder.client,
}));

import { fetchCalcSources } from '../shared/calc-citations';
import {
  createCalcVersion,
  duplicateCalcVersion,
  saveDealCalc,
  saveSdeCalc,
} from './calc-actions';
import {
  addCalcInputCitation,
  removeCalcInputCitation,
} from './calc-citation-actions';
import { createDealCore } from './deal-actions';

type Action = (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

type Client = ReturnType<typeof createClient<Database>>;

let account: IntegrationAccount;
let analyst: { client: Client; id: string };
let viewer: { client: Client; id: string };
let outsider: IntegrationAccount;
let dealId: string;
let folderId: string;
let pnlId: string;

async function as<T>(client: Client, run: () => Promise<T>): Promise<T> {
  holder.client = client;
  const result = await run();
  holder.client = account.user;
  return result;
}

async function newCalcVersion(client: Client, userId: string) {
  return (
    (await as(client, () =>
      (createCalcVersion as unknown as Action)(
        { deal_id: dealId, type: 'sde' },
        { id: userId },
      ),
    )) as { value: string }
  ).value;
}

async function uploadDocument(name: string, version: number) {
  const id = crypto.randomUUID();
  await account.admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'dr_document',
      p_aggregate_id: id,
      p_event_type: 'dr_document.added',
      p_actor_kind: 'service',
      p_payload: {
        folder_id: folderId,
        name,
        storage_path: `deal/${dealId}/${id}-${name}`,
        version,
        uploaded_by: null,
      },
    })
    .throwOnError();
  return id;
}

function cite(client: Client, userId: string, calcVersionId: string) {
  return as(client, () =>
    (addCalcInputCitation as unknown as Action)(
      {
        calc_version_id: calcVersionId,
        input_key: 'sde.0.sales',
        dr_document_id: pnlId,
        locator: { kind: 'page', page: 4 },
        cell: 'B12',
      },
      { id: userId },
    ),
  );
}

async function sources(calcVersionId: string) {
  return fetchCalcSources(account.user, { id: calcVersionId, deal_id: dealId });
}

beforeAll(async () => {
  account = await provisionAccount();
  holder.client = account.user;
  holder.userId = account.userId;
  dealId = await createDealCore(
    account.user,
    {
      account_id: account.accountId,
      business_name: 'Citation deal',
      industry: 'Accounting',
      description: 'Citation deal',
      source: 'manual',
      stage: 'sourcing',
    },
    account.userId,
  );
  folderId = crypto.randomUUID();
  await account.admin
    .from('dr_folder')
    .insert({
      id: folderId,
      account_id: account.accountId,
      deal_id: dealId,
      name: 'Financials',
    })
    .throwOnError();
  pnlId = await uploadDocument('p-and-l.pdf', 1);
  analyst = await signedInMember('analyst');
  viewer = await signedInMember('viewer');
  outsider = await provisionAccount();
});

afterAll(async () => {
  await account.cleanup();
  await outsider.cleanup();
});

const NOT_YOURS =
  "You can change sources only on your own versions that aren't primary or adopted.";

describe('addCalcInputCitation (integration)', () => {
  it('lets an analyst cite a page and cell on their own scratch calc', async () => {
    const calcVersionId = await newCalcVersion(analyst.client, analyst.id);

    const result = await cite(analyst.client, analyst.id, calcVersionId);

    expect(result).toMatchObject({ ok: true });
    expect(await sources(calcVersionId)).toMatchObject({
      canEdit: true,
      citations: [
        {
          inputKey: 'sde.0.sales',
          documentId: pnlId,
          documentName: 'p-and-l.pdf',
          documentVersion: 1,
          locator: { kind: 'page', page: 4 },
          cell: 'B12',
          newerVersionUploaded: false,
          documentRemoved: false,
        },
      ],
    });
  });

  it('refuses an analyst on the primary calc, naming why', async () => {
    const calcVersionId = await newCalcVersion(analyst.client, analyst.id);
    await account.admin
      .from('calc_version')
      .update({ is_primary: true })
      .eq('id', calcVersionId)
      .throwOnError();

    const result = await cite(analyst.client, analyst.id, calcVersionId);

    expect(result).toEqual({ ok: false, refusal: NOT_YOURS });
    expect((await sources(calcVersionId)).citations).toEqual([]);
  });

  it('refuses an analyst on a version a manager made', async () => {
    const calcVersionId = await newCalcVersion(account.user, account.userId);

    expect(await cite(analyst.client, analyst.id, calcVersionId)).toEqual({
      ok: false,
      refusal: NOT_YOURS,
    });
  });

  it('tells a read-only member they cannot change sources', async () => {
    const calcVersionId = await newCalcVersion(account.user, account.userId);

    expect(await cite(viewer.client, viewer.id, calcVersionId)).toEqual({
      ok: false,
      refusal: "Read-only members can't change sources.",
    });
  });

  it('tells someone off the team that only the deal team can change sources', async () => {
    const calcVersionId = await newCalcVersion(account.user, account.userId);

    expect(await cite(outsider.user, outsider.userId, calcVersionId)).toEqual({
      ok: false,
      refusal: 'Only the deal team can change sources.',
    });
  });

  it('refuses a page before the first with a clear message', async () => {
    const calcVersionId = await newCalcVersion(account.user, account.userId);

    const result = await as(account.user, () =>
      (addCalcInputCitation as unknown as Action)(
        {
          calc_version_id: calcVersionId,
          input_key: 'sales',
          dr_document_id: pnlId,
          locator: { kind: 'page', page: 0 },
        },
        { id: account.userId },
      ),
    );

    expect(result).toEqual({ ok: false, refusal: 'Page numbers start at 1' });
  });

  it('cites a whole document when the file has no pages or sheets', async () => {
    const calcVersionId = await newCalcVersion(account.user, account.userId);
    const photoId = await uploadDocument('site-photo.jpg', 1);

    await as(account.user, () =>
      (addCalcInputCitation as unknown as Action)(
        {
          calc_version_id: calcVersionId,
          input_key: 'working_capital',
          dr_document_id: photoId,
          locator: { kind: 'document' },
        },
        { id: account.userId },
      ),
    );

    expect((await sources(calcVersionId)).citations).toMatchObject([
      { documentName: 'site-photo.jpg', locator: { kind: 'document' } },
    ]);
  });

  it('lets a deal manager cite on the primary calc', async () => {
    const calcVersionId = await newCalcVersion(account.user, account.userId);
    await account.admin
      .from('calc_version')
      .update({ is_primary: true })
      .eq('id', calcVersionId)
      .throwOnError();

    const result = await cite(account.user, account.userId, calcVersionId);

    expect(result).toMatchObject({ ok: true });
    expect((await sources(calcVersionId)).citations).toHaveLength(1);
  });

  it('cites an Excel sheet', async () => {
    const calcVersionId = await newCalcVersion(account.user, account.userId);
    const workbookId = await uploadDocument('tax-returns.xlsx', 1);

    await as(account.user, () =>
      (addCalcInputCitation as unknown as Action)(
        {
          calc_version_id: calcVersionId,
          input_key: 'current_assets',
          dr_document_id: workbookId,
          locator: { kind: 'sheet', sheet: 'Balance sheet' },
        },
        { id: account.userId },
      ),
    );

    expect((await sources(calcVersionId)).citations).toMatchObject([
      {
        inputKey: 'current_assets',
        locator: { kind: 'sheet', sheet: 'Balance sheet' },
        cell: null,
      },
    ]);
  });
});

describe('removeCalcInputCitation (integration)', () => {
  it('refuses an analyst removing a citation from a calc a manager made', async () => {
    const calcVersionId = await newCalcVersion(account.user, account.userId);
    await cite(account.user, account.userId, calcVersionId);
    const [citation] = (await sources(calcVersionId)).citations;

    const result = await as(analyst.client, () =>
      (removeCalcInputCitation as unknown as Action)(
        { calc_version_id: calcVersionId, citation_id: citation!.id },
        { id: analyst.id },
      ),
    );

    expect(result).toEqual({ ok: false, refusal: NOT_YOURS });
    expect((await sources(calcVersionId)).citations).toHaveLength(1);
  });

  it('lets an analyst remove a citation from their own scratch calc', async () => {
    const calcVersionId = await newCalcVersion(analyst.client, analyst.id);
    await cite(analyst.client, analyst.id, calcVersionId);
    const [citation] = (await sources(calcVersionId)).citations;

    const result = await as(analyst.client, () =>
      (removeCalcInputCitation as unknown as Action)(
        { calc_version_id: calcVersionId, citation_id: citation!.id },
        { id: analyst.id },
      ),
    );

    expect(result).toMatchObject({ ok: true });
    expect((await sources(calcVersionId)).citations).toEqual([]);
  });

  it('shows an analyst they cannot edit sources on a calc a manager made', async () => {
    const calcVersionId = await newCalcVersion(account.user, account.userId);

    expect(
      (
        await fetchCalcSources(analyst.client, {
          id: calcVersionId,
          deal_id: dealId,
        })
      ).canEdit,
    ).toBe(false);
  });
});

describe('stale citations (integration)', () => {
  it('flags a newer upload, then the removal, and keeps the pinned version', async () => {
    const calcVersionId = await newCalcVersion(account.user, account.userId);
    const ledgerId = await uploadDocument('ledger.pdf', 1);
    await as(account.user, () =>
      (addCalcInputCitation as unknown as Action)(
        {
          calc_version_id: calcVersionId,
          input_key: 'sde.0.cogs',
          dr_document_id: ledgerId,
          locator: { kind: 'page', page: 2 },
        },
        { id: account.userId },
      ),
    );

    await uploadDocument('ledger.pdf', 2);

    expect((await sources(calcVersionId)).citations).toMatchObject([
      {
        documentId: ledgerId,
        documentVersion: 1,
        newerVersionUploaded: true,
        documentRemoved: false,
      },
    ]);

    await account.admin
      .rpc('append_deal_event', {
        p_deal_id: dealId,
        p_aggregate_type: 'dr_document',
        p_aggregate_id: ledgerId,
        p_event_type: 'dr_document.removed',
        p_actor_kind: 'service',
        p_payload: {},
      })
      .throwOnError();

    expect((await sources(calcVersionId)).citations).toMatchObject([
      { documentId: ledgerId, documentRemoved: true },
    ]);
  });
});

async function signedInMember(role: 'analyst' | 'viewer') {
  const unique = crypto.randomUUID().slice(0, 8);
  const email = `int-${role}-${unique}@odb.test`;
  const password = `Pw-${unique}-Aa1!`;
  const { data } = await account.admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  await account.admin
    .from('accounts_memberships')
    .insert({
      account_id: account.accountId,
      user_id: data.user!.id,
      account_role: role,
    })
    .throwOnError();
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
    (account.user as unknown as { supabaseKey: string }).supabaseKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  await client.auth.signInWithPassword({ email, password });
  return { client, id: data.user!.id };
}

describe('the data room files offered for citing', () => {
  it('marks the latest version of each file', async () => {
    const calcVersionId = await newCalcVersion(account.user, account.userId);
    const first = await uploadDocument('lease.docx', 1);
    const second = await uploadDocument('lease.docx', 2);
    const deck = await uploadDocument('cim.pptx', 1);
    const ledger = await uploadDocument('ledger.csv', 1);

    const { documents } = await sources(calcVersionId);

    expect(
      documents.filter((document) =>
        [first, second, deck, ledger].includes(document.id),
      ),
    ).toEqual(
      expect.arrayContaining([
        {
          id: first,
          name: 'lease.docx',
          version: 1,
          locator: 'page',
          latest: false,
        },
        {
          id: second,
          name: 'lease.docx',
          version: 2,
          locator: 'page',
          latest: true,
        },
        {
          id: deck,
          name: 'cim.pptx',
          version: 1,
          locator: 'page',
          latest: true,
        },
        {
          id: ledger,
          name: 'ledger.csv',
          version: 1,
          locator: 'sheet',
          latest: true,
        },
      ]),
    );
  });
});

describe('citations follow their row (integration)', () => {
  it('refuses a citation on a row the version has not saved', async () => {
    const calcVersionId = await newCalcVersion(account.user, account.userId);

    const result = await as(account.user, () =>
      (addCalcInputCitation as unknown as Action)(
        {
          calc_version_id: calcVersionId,
          row_id: crypto.randomUUID(),
          input_key: 'sales',
          dr_document_id: pnlId,
          locator: { kind: 'page', page: 1 },
        },
        { id: account.userId },
      ),
    );

    expect(result).toEqual({
      ok: false,
      refusal: 'Save the calc to add sources to this row',
    });
    expect((await sources(calcVersionId)).citations).toEqual([]);
  });

  function sdePeriod(id: string, rentId: string, weight: number) {
    return {
      id,
      weight,
      lines: [
        { line_code: 'sales', amount: 100 },
        { id: rentId, line_code: 'custom', custom_label: 'Rent', amount: 10 },
      ],
    };
  }

  async function citeRow(calcVersionId: string, rowId: string, field: string) {
    await as(account.user, () =>
      (addCalcInputCitation as unknown as Action)(
        {
          calc_version_id: calcVersionId,
          row_id: rowId,
          input_key: field,
          dr_document_id: pnlId,
          locator: { kind: 'page', page: 1 },
        },
        { id: account.userId },
      ),
    );
  }

  it('keeps the citations of kept SDE rows and drops those of removed ones on save', async () => {
    const calcVersionId = await newCalcVersion(account.user, account.userId);
    const [first, second, firstRent, secondRent] = [1, 2, 3, 4].map(() =>
      crypto.randomUUID(),
    );
    const save = (periods: unknown[]) =>
      (saveSdeCalc as unknown as Action)(
        { calc_version_id: calcVersionId, periods },
        { id: account.userId },
      );
    await save([
      sdePeriod(first!, firstRent!, 0.5),
      sdePeriod(second!, secondRent!, 0.5),
    ]);
    await citeRow(calcVersionId, first!, 'sales');
    await citeRow(calcVersionId, second!, 'sales');
    await citeRow(calcVersionId, secondRent!, 'amount');

    await save([sdePeriod(second!, secondRent!, 1)]);

    expect(
      (await sources(calcVersionId)).citations.map((c) => [
        c.rowId,
        c.inputKey,
      ]),
    ).toEqual([
      [second, 'sales'],
      [secondRent, 'amount'],
    ]);
    const { data: periods } = await account.admin
      .from('sde_period')
      .select('id')
      .eq('calc_version_id', calcVersionId)
      .throwOnError();
    expect(periods.map((period) => period.id)).toEqual([second]);
  });

  it('drops the citations of a removed funding source on save', async () => {
    const calcVersionId = await newCalcVersion(account.user, account.userId);
    const [kept, dropped] = [crypto.randomUUID(), crypto.randomUUID()];
    const loan = (id: string) => ({
      id,
      type: 'sba_7a',
      amount: 500_000,
      rate: 0.1,
      term_years: 10,
    });
    const save = (funding: unknown[]) =>
      (saveDealCalc as unknown as Action)(
        {
          calc_version_id: calcVersionId,
          inputs: {
            pl: {
              sales: 1_000_000,
              cogs: 0,
              opex: 0,
              depreciation_amortization: 0,
              taxes: 0,
              interest: 0,
              owner_benefits: 0,
            },
            purchase_price: 900_000,
          },
          funding_sources: funding,
        },
        { id: account.userId },
      );
    await save([loan(kept), loan(dropped)]);
    await citeRow(calcVersionId, kept, 'rate');
    await citeRow(calcVersionId, dropped, 'rate');

    await save([loan(kept)]);

    expect(
      (await sources(calcVersionId)).citations.map((c) => c.rowId),
    ).toEqual([kept]);
  });

  it('copies citations onto a duplicate, onto its own rows, with the copier as their creator', async () => {
    const calcVersionId = await newCalcVersion(account.user, account.userId);
    const [period, rent] = [crypto.randomUUID(), crypto.randomUUID()];
    await (saveSdeCalc as unknown as Action)(
      { calc_version_id: calcVersionId, periods: [sdePeriod(period, rent, 1)] },
      { id: account.userId },
    );
    await citeRow(calcVersionId, period, 'sales');
    await citeRow(calcVersionId, rent, 'amount');

    const copy = (
      (await as(analyst.client, () =>
        (duplicateCalcVersion as unknown as Action)(
          { calc_version_id: calcVersionId },
          { id: analyst.id },
        ),
      )) as { value: string }
    ).value;

    const { data: copiedPeriod } = await account.admin
      .from('sde_period')
      .select('id, sde_line(id, line_code)')
      .eq('calc_version_id', copy)
      .single()
      .throwOnError();
    const copiedRent = copiedPeriod.sde_line.find(
      (line) => line.line_code === 'custom',
    )!.id;
    const copied = (await sources(copy)).citations.map((c) => [
      c.rowId,
      c.inputKey,
    ]);
    expect(copied).toHaveLength(2);
    expect(copied).toEqual(
      expect.arrayContaining([
        [copiedPeriod.id, 'sales'],
        [copiedRent, 'amount'],
      ]),
    );
    const { data: creators } = await account.admin
      .from('calc_input_citation')
      .select('created_by')
      .eq('calc_version_id', copy)
      .throwOnError();
    expect(creators.map((row) => row.created_by)).toEqual([
      analyst.id,
      analyst.id,
    ]);
  });
});
