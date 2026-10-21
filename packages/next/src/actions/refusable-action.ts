import type { User } from '@supabase/supabase-js';

import type { ZodType } from 'zod';

import { getSupabaseServerClient } from '@odb/supabase/server';

import { type ActionResult, Refusal } from '../refusal';
import { enhanceAction } from './index';

export interface Denied<Input> {
  what: string;
  needs: 'deals.manage' | 'deals.work' | 'deals.create' | 'checklists.manage';
  dealId?: (input: Input) => string | Promise<string>;
}

export async function whomToAsk(dealId: string): Promise<string> {
  const client = getSupabaseServerClient();
  const [{ data: deal }, { data: people }] = await Promise.all([
    client
      .from('deal')
      .select('owner_user_id')
      .eq('id', dealId)
      .single()
      .throwOnError(),
    client.rpc('deal_people', { deal_id: dealId }).throwOnError(),
  ]);

  return (
    people.find((person) => person.user_id === deal.owner_user_id)?.name ??
    'a deal manager'
  );
}

async function onDealTeam(dealId: string): Promise<boolean> {
  const client = getSupabaseServerClient();
  const { data: deal } = await client
    .from('deal')
    .select('account_id')
    .eq('id', dealId)
    .maybeSingle()
    .throwOnError();

  if (!deal) {
    return false;
  }

  const { data: member } = await client
    .rpc('has_role_on_account', { account_id: deal.account_id })
    .throwOnError();

  return member;
}

async function deniedReason<Input>(
  denied: Denied<Input>,
  input: Input,
  dbMessage: string,
): Promise<string> {
  const needs = /needs (\S+)$/.exec(dbMessage)?.[1] ?? denied.needs;
  const dealId = denied.dealId && (await denied.dealId(input));

  if (dealId && !(await onDealTeam(dealId))) {
    return `Only the deal team can ${denied.what}.`;
  }

  if (needs !== 'deals.manage') {
    return `Read-only members can't ${denied.what}. Ask a deal manager.`;
  }

  const whom = dealId ? await whomToAsk(dealId) : 'a deal manager';

  return `Only deal managers can ${denied.what}. Ask ${whom}.`;
}

export function refusableAction<Input, Value>(
  fn: (input: Input, user: User) => Promise<Value>,
  schema: ZodType<Input>,
  denied?: Denied<Input>,
): (input: Input) => Promise<ActionResult<Value>> {
  const run = enhanceAction(
    async (input: Input, user): Promise<ActionResult<Value>> => {
      try {
        return { ok: true, value: await fn(input, user) };
      } catch (error) {
        if (error instanceof Refusal) {
          return { ok: false, refusal: error.message };
        }

        const { code, message } = error as { code?: string; message: string };

        if (denied && code === '42501') {
          return {
            ok: false,
            refusal: await deniedReason(denied, input, message),
          };
        }

        throw error;
      }
    },
    { auth: true, schema },
  );

  return async (input) => {
    const parsed = schema.safeParse(input);

    return parsed.success
      ? run(input)
      : { ok: false, refusal: parsed.error.issues[0]!.message };
  };
}
