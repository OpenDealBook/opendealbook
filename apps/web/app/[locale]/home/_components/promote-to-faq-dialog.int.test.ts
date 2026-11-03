import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  type Person,
  admin,
  provisionPerson,
  removeEverythingSeeded,
  seedTeamDeal,
} from '@odb/lender-rooms/asks/integration-harness.ts';

const session = vi.hoisted(() => ({ client: null as unknown }));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => session.client,
}));

vi.mock('@odb/supabase/admin', async () => {
  const harness = await import('@odb/lender-rooms/asks/integration-harness.ts');
  return { getSupabaseServerAdminClient: () => harness.admin };
});

import { saveNewFaqEntry } from '@odb/lender-rooms/faq/publish.ts';

let manager: Person;
let member: Person;
let deal: { accountId: string; dealId: string };

function promoted(entryId: string) {
  return {
    entryId,
    dealId: deal.dealId,
    askIds: [],
    question: 'What was 2025 revenue?',
    answer: 'Revenue was about $2M.',
    status: 'draft' as const,
    files: [],
  };
}

async function entryRow(entryId: string) {
  const { data } = await admin
    .from('lender_faq_entry')
    .select('question, answer, status, sources:lender_faq_source(ask_id)')
    .eq('id', entryId)
    .maybeSingle()
    .throwOnError();
  return data;
}

beforeAll(async () => {
  [manager, member] = await Promise.all([provisionPerson(), provisionPerson()]);
  deal = await seedTeamDeal(manager, member);
});

afterAll(async () => {
  await admin
    .from('lender_faq_entry')
    .delete()
    .eq('deal_id', deal.dealId)
    .throwOnError();
  await removeEverythingSeeded();
});

describe('promoting an AI answer to the lender FAQ', () => {
  it('creates a draft entry with the edited wording and no lender request', async () => {
    const entryId = crypto.randomUUID();
    session.client = manager.client;

    expect(await saveNewFaqEntry(promoted(entryId))).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await entryRow(entryId)).toEqual({
      question: 'What was 2025 revenue?',
      answer: 'Revenue was about $2M.',
      status: 'draft',
      sources: [],
    });
  });

  it('refuses a team member without deals.manage and saves nothing', async () => {
    const entryId = crypto.randomUUID();
    session.client = member.client;

    expect(await saveNewFaqEntry(promoted(entryId))).toEqual({
      ok: false,
      refusal: 'Only the deal team can do that',
    });
    expect(await entryRow(entryId)).toBeNull();
  });

  it('blocks a direct insert by a team member without deals.manage', async () => {
    const { error } = await member.client.from('lender_faq_entry').insert({
      account_id: deal.accountId,
      deal_id: deal.dealId,
      question: 'What was 2025 revenue?',
      answer: 'Revenue was about $2M.',
    });

    expect(error?.code).toBe('42501');
  });
});
