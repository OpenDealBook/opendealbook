import 'server-only';
import { z } from 'zod';

import { enhanceAction } from '@tuckin/next/actions';
import type { TablesInsert } from '@tuckin/supabase';
import { getSupabaseServerClient } from '@tuckin/supabase/server';

import { assertDealsCreate, assertDealsManage } from '../permission';

const createSchema = z.object({
  accountId: z.string().uuid(),
  firmName: z.string().min(1),
  teaser: z.string().nullish(),
  askingPrice: z.number().nullish(),
  ndaRequired: z.boolean().default(false),
  submittedByContactId: z.string().uuid().nullish(),
});

type CreateBrokerIntakeInput = z.infer<typeof createSchema>;

export const createBrokerIntake = enhanceAction(
  async (input: CreateBrokerIntakeInput, user) => {
    const client = getSupabaseServerClient();

    await assertDealsManage(client, input.accountId, user.id);

    const created = await client
      .from('broker_intake')
      .insert({
        account_id: input.accountId,
        firm_name: input.firmName,
        teaser: input.teaser ?? null,
        asking_price: input.askingPrice ?? null,
        nda_required: input.ndaRequired,
        submitted_by_contact_id: input.submittedByContactId ?? null,
      } satisfies TablesInsert<'broker_intake'>)
      .select('*')
      .single();

    return created.data;
  },
  { auth: true, schema: createSchema },
);

const listSchema = z.object({
  accountId: z.string().uuid(),
});

type ListBrokerIntakesInput = z.infer<typeof listSchema>;

export const listBrokerIntakes = enhanceAction(
  async (input: ListBrokerIntakesInput, user) => {
    const client = getSupabaseServerClient();

    await assertDealsManage(client, input.accountId, user.id);

    const intakes = await client
      .from('broker_intake')
      .select('*')
      .eq('account_id', input.accountId)
      .order('created_at', { ascending: false });

    return intakes.data ?? [];
  },
  { auth: true, schema: listSchema },
);

const acceptSchema = z.object({
  accountId: z.string().uuid(),
  intakeId: z.string().uuid(),
  createDeal: z.boolean().default(false),
});

type AcceptBrokerIntakeInput = z.infer<typeof acceptSchema>;

export const acceptBrokerIntake = enhanceAction(
  async (input: AcceptBrokerIntakeInput, user) => {
    const client = getSupabaseServerClient();

    await assertDealsManage(client, input.accountId, user.id);

    const intake = await client
      .from('broker_intake')
      .select('*')
      .eq('id', input.intakeId)
      .eq('account_id', input.accountId)
      .single();

    const firm = await client
      .from('firm')
      .insert({
        account_id: input.accountId,
        name: intake.data?.firm_name ?? '',
        source: 'broker',
        status: 'imported',
      } satisfies TablesInsert<'firm'>)
      .select('id')
      .single();

    await client
      .from('broker_intake')
      .update({ firm_id: firm.data?.id, status: 'accepted' })
      .eq('id', input.intakeId);

    if (!input.createDeal) {
      return { firmId: firm.data?.id, dealId: null };
    }

    await assertDealsCreate(client, input.accountId, user.id);

    const deal = await client
      .from('deal')
      .insert({
        account_id: input.accountId,
        firm_id: firm.data?.id,
        source: 'broker',
        asking_price: intake.data?.asking_price ?? null,
        broker_contact_id: intake.data?.submitted_by_contact_id ?? null,
      } satisfies TablesInsert<'deal'>)
      .select('id')
      .single();

    return { firmId: firm.data?.id, dealId: deal.data?.id ?? null };
  },
  { auth: true, schema: acceptSchema },
);
