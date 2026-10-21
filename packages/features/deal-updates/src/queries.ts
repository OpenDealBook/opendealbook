import 'server-only';
import type { DealRoster } from '@odb/deal-people/queries.ts';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { picksSchema } from './schema';

export type DealUpdatesBoard = Awaited<ReturnType<typeof loadDealUpdates>>;

export async function loadDealUpdates({
  dealId,
  accountId,
  roster,
}: {
  dealId: string;
  accountId: string;
  roster: DealRoster;
}) {
  const client = getSupabaseServerClient();
  const [{ data: rows }, { data: signedIn }] = await Promise.all([
    client
      .from('deal_update')
      .select(
        'id, author_id, subject, body, picks, status, version, decision_note, deal_update_recipient(email, name, user_id, contact_id, sent_at, failed_at, error)',
      )
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false })
      .throwOnError(),
    client.auth.getUser(),
  ]);
  const me = signedIn.user!.id;
  const otherTeamIds = roster.people.flatMap((person) =>
    person.user_id !== me &&
    person.entries.some((entry) => entry.source === 'team')
      ? [person.user_id!]
      : [],
  );
  const [canApprove, ...approves] = await Promise.all(
    [me, ...otherTeamIds].map(async (userId) => {
      const { data } = await client
        .rpc('has_permission', {
          user_id: userId,
          account_id: accountId,
          permission_name: 'deal_updates.approve',
        })
        .throwOnError();

      return data;
    }),
  );

  return {
    people: roster.people,
    canManage: roster.canEdit,
    canApprove,
    hasOtherApprover: approves.includes(true),
    updates: rows.map(
      ({ author_id, picks, deal_update_recipient, ...update }) => ({
        ...update,
        picks: picksSchema.parse(picks),
        mine: author_id === me,
        recipients: deal_update_recipient.map(toRecipient),
      }),
    ),
  };
}

function toRecipient(row: {
  email: string;
  name: string | null;
  user_id: string | null;
  contact_id: string | null;
  sent_at: string | null;
  failed_at: string | null;
  error: string | null;
}) {
  return {
    email: row.email,
    name: row.name,
    deleted: row.user_id === null && row.contact_id === null,
    delivery: row.sent_at
      ? { state: 'sent' as const }
      : row.failed_at
        ? { state: 'failed' as const, error: row.error }
        : { state: 'pending' as const },
  };
}
