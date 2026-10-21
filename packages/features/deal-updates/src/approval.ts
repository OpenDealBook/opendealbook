'use server';

import type { User } from '@supabase/supabase-js';

import { z } from 'zod';

import { loadDealPeople } from '@odb/deal-people/queries.ts';
import { refusableAction } from '@odb/lender-rooms/actions/refusable-action.ts';
import { Refusal } from '@odb/lender-rooms/actions/refusal.ts';
import { refuseWhileTeamLocked } from '@odb/lender-rooms/actions/team-lock.ts';
import { teamItemPath } from '@odb/notifications/relay';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { startDealUpdateDelivery } from '@odb/workflows/client';

import { resolveRecipients } from './groups';
import { picksSchema } from './schema';

const opened = { updateId: z.uuid(), version: z.number().int() };

type Decision =
  | { decision: 'approved'; recipients: string[] }
  | { decision: 'rejected'; note: string };

function sameEmails(a: string[], b: string[]) {
  return a.toSorted().join() === b.toSorted().join();
}

function deliver(updateId: string) {
  return startDealUpdateDelivery({
    updateId,
    origin: process.env.NEXT_PUBLIC_SITE_URL!,
  });
}

async function approvedRecipients(
  update: {
    deal_id: string;
    account_id: string;
    author_id: string | null;
    picks: unknown;
  },
  shown: string[],
) {
  const { people } = await loadDealPeople({
    dealId: update.deal_id,
    accountId: update.account_id,
  });
  const picks = picksSchema.parse(update.picks);

  if (
    !sameEmails(
      resolveRecipients(people, picks).map((recipient) => recipient.email),
      shown,
    )
  ) {
    throw new Refusal(
      'Recipients changed since you opened this. Review again.',
    );
  }

  const { author_id: authorId } = update;

  if (authorId === null) {
    return resolveRecipients(people, picks);
  }

  const onTeam = people.find((person) => person.user_id === authorId);

  if (onTeam) {
    return resolveRecipients(people, {
      ...picks,
      people: [...picks.people, onTeam.email!],
    });
  }

  return [...resolveRecipients(people, picks), await formerTeammate(authorId)];
}

async function formerTeammate(userId: string) {
  const { data: personal } = await getSupabaseServerAdminClient()
    .from('accounts')
    .select('name, email')
    .eq('primary_owner_user_id', userId)
    .eq('is_personal_account', true)
    .single()
    .throwOnError();

  return {
    user_id: userId,
    contact_id: null,
    email: personal.email!,
    name: personal.name,
    entries: [],
  };
}

async function decide(
  user: User,
  { updateId, version }: z.infer<z.ZodObject<typeof opened>>,
  ruling: Decision,
) {
  if (
    ruling.decision === 'approved' &&
    !process.env.SELLER_DELIVERY_FROM_EMAIL
  ) {
    throw new Refusal(
      "Deal update email isn't set up. Ask your admin to set the sender address.",
    );
  }

  const client = getSupabaseServerClient();
  const { data: update } = await client
    .from('deal_update')
    .select(
      'account_id, deal_id, author_id, subject, picks, status, version, decided_by, accounts(slug)',
    )
    .eq('id', updateId)
    .single()
    .throwOnError();

  await refuseWhileTeamLocked(update.account_id);

  if (update.version !== version) {
    throw new Refusal(
      'This update changed since you opened it. Review it again.',
    );
  }

  const repeat =
    update.status === ruling.decision && update.decided_by === user.id;

  if (!repeat && update.status !== 'pending') {
    throw new Refusal('Another approver already decided this update.');
  }

  const recipients =
    ruling.decision === 'approved'
      ? await approvedRecipients(update, ruling.recipients)
      : [];

  const note = ruling.decision === 'rejected' ? ruling.note : null;

  if (!repeat) {
    await client
      .rpc('decide_deal_update', {
        update_id: updateId,
        expected_version: version,
        decision: ruling.decision,
        ...(note === null ? {} : { note }),
      })
      .throwOnError();
  }

  if (ruling.decision === 'approved') {
    await getSupabaseServerAdminClient()
      .rpc('record_deal_update_recipients', {
        update_id: updateId,
        recipients,
      })
      .throwOnError();
    await deliver(updateId);
  }

  if (repeat || update.author_id === null) {
    return;
  }

  await getSupabaseServerAdminClient()
    .from('notifications')
    .insert({
      account_id: update.account_id,
      recipient_user_id: update.author_id,
      deal_id: update.deal_id,
      type: 'info',
      body: `Your update "${update.subject}" was ${ruling.decision}${note === null ? '' : `: ${note}`}`,
      link: teamItemPath(
        z.string().parse(update.accounts.slug),
        update.deal_id,
        {
          kind: 'deal-update',
          id: updateId,
        },
      ),
    })
    .throwOnError();
}

export const approveDealUpdate = refusableAction(
  ({ recipients, ...input }, user) =>
    decide(user, input, { decision: 'approved', recipients }),
  { schema: z.object({ ...opened, recipients: z.array(z.string()) }) },
);

export const rejectDealUpdate = refusableAction(
  ({ note, ...input }, user) =>
    decide(user, input, { decision: 'rejected', note }),
  {
    schema: z.object({
      ...opened,
      note: z.string().trim().min(1, 'Say why the update is rejected.'),
    }),
  },
);
