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

vi.mock('@odb/ai/server', () => ({
  generateStructured: async (
    _client: unknown,
    input: { parse: (raw: unknown) => unknown },
  ) =>
    input.parse({
      revenue: 4200000,
      sde: 900000,
      ebitda: 750000,
      asking_price: 3500000,
      industry: 'HVAC services',
      location: 'Austin, TX',
      description: 'Established HVAC contractor',
      employees: '25-50',
      business_model: 'Recurring service contracts',
      reason_for_sale: 'retirement',
    }),
}));

vi.mock('unpdf', () => ({
  getDocumentProxy: async () => ({ numPages: 1 }),
  extractText: async () => ({ totalPages: 1, text: 'EXTRACTED PDF LISTING TEXT' }),
}));

import {
  createDealFromIntake,
  extractDealIntakeFromPdf,
  extractDealIntakeFromText,
} from './intake-actions';

let account: IntegrationAccount;

beforeAll(async () => {
  account = await provisionAccount();
  holder.client = account.user;
  holder.userId = account.userId;
});

afterAll(async () => {
  await account.cleanup();
});

const draft = {
  revenue: 4200000,
  sde: 900000,
  ebitda: 750000,
  asking_price: 3500000,
  industry: 'HVAC services',
  location: 'Austin, TX',
  description: 'Established HVAC contractor',
  employees: '25-50',
  business_model: 'Recurring service contracts',
  reason_for_sale: 'retirement',
};

describe('extractDealIntakeFromText (integration)', () => {
  it('returns the extracted draft, industry included, without creating a deal', async () => {
    const before = await account.admin
      .from('deal')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', account.accountId);

    expect(
      await extractDealIntakeFromText({
        account_id: account.accountId,
        text: 'a listing memo',
      }),
    ).toEqual({ ok: true, value: draft });

    const after = await account.admin
      .from('deal')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', account.accountId);
    expect(after.count).toBe(before.count);
  });
});

describe('extractDealIntakeFromPdf (integration)', () => {
  it('returns the draft extracted from the PDF text', async () => {
    expect(
      await extractDealIntakeFromPdf({
        account_id: account.accountId,
        pdf: Buffer.from('%PDF-1.4 listing').toString('base64'),
      }),
    ).toEqual({ ok: true, value: draft });
  });
});

async function asViewer(run: () => Promise<unknown>) {
  const unique = crypto.randomUUID().slice(0, 8);
  const email = `int-viewer-${unique}@odb.test`;
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
      account_role: 'viewer',
    })
    .throwOnError();
  const viewer = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
    (account.user as unknown as { supabaseKey: string }).supabaseKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  await viewer.auth.signInWithPassword({ email, password });

  holder.client = viewer;
  holder.userId = data.user!.id;
  const result = await run();
  holder.client = account.user;
  holder.userId = account.userId;

  return result;
}

describe('AI extraction permission (integration)', () => {
  const refusal = {
    ok: false,
    refusal: "Read-only members can't create deals. Ask a deal manager.",
  };

  it('refuses text extraction to a teammate who cannot create deals', async () => {
    expect(
      await asViewer(() =>
        extractDealIntakeFromText({
          account_id: account.accountId,
          text: 'a listing memo',
        }),
      ),
    ).toEqual(refusal);
  });

  it('refuses PDF extraction to a teammate who cannot create deals', async () => {
    expect(
      await asViewer(() =>
        extractDealIntakeFromPdf({
          account_id: account.accountId,
          pdf: Buffer.from('%PDF-1.4 listing').toString('base64'),
        }),
      ),
    ).toEqual(refusal);
  });
});

describe('createDealFromIntake (integration)', () => {
  it('creates the extracted deal under the business name and the industry the person chose', async () => {
    const result = await createDealFromIntake({
      account_id: account.accountId,
      business_name: 'Brennan Climate Services',
      industry: 'Home Services',
      draft,
    });

    expect(result.ok).toBe(true);

    const { data } = await account.admin
      .from('deal')
      .select('asking_price, description, firm:firm_id(name), deal_profile(industry, location_raw)')
      .eq('id', (result as { value: string }).value)
      .single()
      .throwOnError();

    expect(data).toMatchObject({
      asking_price: 3500000,
      description: 'Established HVAC contractor',
      firm: { name: 'Brennan Climate Services' },
      deal_profile: { industry: 'Home Services', location_raw: 'Austin, TX' },
    });
  });

  it('refuses without a business name', async () => {
    expect(
      await createDealFromIntake({
        account_id: account.accountId,
        business_name: '',
        industry: 'Home Services',
        draft,
      }),
    ).toEqual({ ok: false, refusal: 'Enter the business name.' });
  });
});
