import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  ANON_KEY,
  SERVICE_ROLE_KEY,
  SUPABASE_URL,
  admin,
  cleanUp,
  newDeal,
  provisionPerson,
  provisionTeam,
  type Person,
} from '@odb/seller-rooms/test-support/world.ts';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);

const session = vi.hoisted(() => ({ client: null as unknown }));

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => session.client,
}));

vi.mock('../superdoc', () => ({
  createSuperdocEngine: () => ({
    fill: async () => new Uint8Array(),
  }),
}));

vi.mock('../storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../storage')>()),
  createSupabaseTemplateStorage: () => ({
    downloadTemplate: async () => new Uint8Array(),
    uploadGenerated: async () => undefined,
  }),
}));

vi.mock('./convert-pdf', () => ({
  convertDocxToPdf: async () => new Uint8Array(),
}));

import { generateFromTemplate } from './actions';

const runGenerate = generateFromTemplate as unknown as (
  input: Record<string, unknown>,
  user: { id: string },
) => Promise<{ values_json: Record<string, unknown> }>;

let owner: Person;
let teamId: string;
let dealId: string;
let templateId: string;

beforeAll(async () => {
  owner = await provisionPerson();
  session.client = owner.client;
  teamId = await provisionTeam(owner, 'Close Date Templates');
  dealId = await newDeal(teamId, owner);

  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'deal_milestone',
      p_aggregate_id: crypto.randomUUID(),
      p_event_type: 'deal_milestone.set',
      p_payload: { kind: 'closing', target_on: '2026-03-01', actual_on: '2026-02-20' },
      p_actor_kind: 'service',
    })
    .throwOnError();

  const { data: template } = await admin
    .from('document_template')
    .insert({ account_id: teamId, name: 'Closing letter', type: 'letter' })
    .select('id')
    .single()
    .throwOnError();
  templateId = template.id;

  await admin
    .from('template_field')
    .insert({
      template_id: templateId,
      key: 'deal.close_date',
      type: 'date',
      source: 'deal',
      source_path: 'close_date',
      sort_order: 0,
    })
    .throwOnError();
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('generateFromTemplate', () => {
  it('fills a close_date field from the deal closing milestone', async () => {
    const generated = await runGenerate(
      { accountId: teamId, templateId, dealId, fieldValues: {} },
      { id: owner.userId },
    );

    expect(generated.values_json['deal.close_date']).toBe('2026-02-20');
  });
});
