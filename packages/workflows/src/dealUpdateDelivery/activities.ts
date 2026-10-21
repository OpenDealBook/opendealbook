import { ApplicationFailure } from '@temporalio/common';
import { z } from 'zod';

import {
  EMAIL_TEMPLATE_RENDERERS,
  viaOpenDealBook,
} from '@odb/email-templates';
import { getMailer } from '@odb/mailers';
import { teamItemPath } from '@odb/notifications/relay';
import type { Database } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

type Entry = Database['public']['CompositeTypes']['deal_person_entry'];

export interface DealUpdateDeliveryInput {
  updateId: string;
  origin: string;
}

// Twice the activity's start-to-close timeout in the workflow, so a claim is
// only retaken once the attempt that made it has certainly been abandoned.
const CLAIM_EXPIRES_MS = 10 * 60_000;

function linksFor(
  entries: Entry[],
  deal: { id: string; teamSlug: string },
  origin: string,
) {
  return entries.flatMap((entry) => {
    if (entry.room_closed) {
      return [];
    }

    switch (entry.source) {
      case 'lender_room':
        return [
          {
            label: `${entry.company} lender room`,
            href: `${origin}/lender/${entry.lender_room_id}`,
          },
        ];
      case 'seller_room':
        return [{ label: 'Seller room', href: `${origin}/seller/${deal.id}` }];
      case 'counsel':
        return [
          { label: 'Counsel portal', href: `${origin}/counsel/${deal.id}` },
        ];
      case 'team':
        return [
          {
            label: 'Open the deal',
            href: `${origin}/home/${deal.teamSlug}/deals/${deal.id}`,
          },
        ];
      default:
        return [];
    }
  });
}

function namesFor(
  entries: Entry[],
  deal: { businessName: string; outsideName: string },
) {
  const outside = entries.filter((entry) => entry.source !== 'team');

  if (outside.length === 0) {
    return { inSubject: null, inBody: deal.businessName };
  }

  return {
    inSubject: deal.outsideName,
    inBody: outside.every((entry) => entry.side === 'seller')
      ? deal.businessName
      : deal.outsideName,
  };
}

export async function deliverDealUpdate({
  updateId,
  origin,
}: DealUpdateDeliveryInput): Promise<void> {
  const sender = process.env.SELLER_DELIVERY_FROM_EMAIL;

  if (!sender) {
    throw ApplicationFailure.nonRetryable(
      'Missing required environment variable: SELLER_DELIVERY_FROM_EMAIL',
    );
  }

  const admin = getSupabaseServerAdminClient();

  const { data: update } = await admin
    .from('deal_update')
    .select(
      'subject, body, deal_id, author_id, accounts(name, slug), deal(code_name, firm!inner(name))',
    )
    .eq('id', updateId)
    .single()
    .throwOnError();

  const replyTo =
    update.author_id === null
      ? undefined
      : (
          await admin
            .from('deal_update_recipient')
            .select('email')
            .eq('update_id', updateId)
            .eq('user_id', update.author_id)
            .single()
            .throwOnError()
        ).data.email;

  const senderName =
    update.author_id === null
      ? update.accounts.name
      : (
          await admin
            .from('accounts')
            .select('name')
            .eq('primary_owner_user_id', update.author_id)
            .eq('is_personal_account', true)
            .single()
            .throwOnError()
        ).data.name;

  const { data: unsent } = await admin
    .from('deal_update_recipient')
    .select('id')
    .eq('update_id', updateId)
    .is('sent_at', null)
    .is('failed_at', null)
    .throwOnError();

  const mailer = await getMailer();
  const failures: string[] = [];

  for (const { id } of unsent) {
    const { data: claimed } = await admin
      .from('deal_update_recipient')
      .update({ claimed_at: new Date().toISOString() })
      .eq('id', id)
      .is('sent_at', null)
      .is('failed_at', null)
      .or(
        `claimed_at.is.null,claimed_at.lt.${new Date(Date.now() - CLAIM_EXPIRES_MS).toISOString()}`,
      )
      .select('email, entries')
      .maybeSingle()
      .throwOnError();

    if (!claimed) {
      continue;
    }

    const names = namesFor(claimed.entries, {
      businessName: update.deal.firm.name,
      outsideName: update.deal.code_name ?? update.deal.firm.name,
    });
    const rendered = await EMAIL_TEMPLATE_RENDERERS['deal-update']({
      productName: 'Open Deal Book',
      teamName: update.accounts.name,
      dealName: names.inBody,
      subject: names.inSubject
        ? `${names.inSubject}: ${update.subject}`
        : update.subject,
      body: update.body,
      links: linksFor(
        claimed.entries,
        { id: update.deal_id, teamSlug: update.accounts.slug! },
        origin,
      ),
    });

    try {
      await mailer.sendEmail({
        to: claimed.email,
        from: viaOpenDealBook(senderName, sender),
        replyTo,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });
    } catch (error) {
      const message = (error as Error).message;

      failures.push(message);
      await admin
        .from('deal_update_recipient')
        .update({ claimed_at: null, error: message })
        .eq('id', id)
        .throwOnError();
      continue;
    }

    await admin
      .from('deal_update_recipient')
      .update({ sent_at: new Date().toISOString(), error: null })
      .eq('id', id)
      .throwOnError();
  }

  if (failures.length > 0) {
    throw new Error(failures.join('; '));
  }
}

export async function finishDealUpdateDelivery({
  updateId,
}: DealUpdateDeliveryInput): Promise<void> {
  const admin = getSupabaseServerAdminClient();

  const { data: update } = await admin
    .from('deal_update')
    .select('account_id, deal_id, author_id, subject, accounts(slug)')
    .eq('id', updateId)
    .single()
    .throwOnError();

  const { data: failed } = await admin
    .from('deal_update_recipient')
    .update({ failed_at: new Date().toISOString() })
    .eq('update_id', updateId)
    .is('sent_at', null)
    .is('failed_at', null)
    .select('id')
    .throwOnError();

  if (failed.length > 0 && update.author_id !== null) {
    await admin
      .from('notifications')
      .insert({
        account_id: update.account_id,
        recipient_user_id: update.author_id,
        deal_id: update.deal_id,
        type: 'warning',
        body: `Some recipients didn't receive "${update.subject}". See the update for details.`,
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

  const { data: recorded } = await admin
    .from('deal_event')
    .select('id')
    .eq('aggregate_type', 'deal_update')
    .eq('aggregate_id', updateId)
    .eq('event_type', 'deal_update.sent')
    .maybeSingle()
    .throwOnError();

  if (recorded) {
    return;
  }

  await admin
    .rpc('append_deal_event', {
      p_deal_id: update.deal_id,
      p_aggregate_type: 'deal_update',
      p_aggregate_id: updateId,
      p_event_type: 'deal_update.sent',
      p_payload: { subject: update.subject },
      p_expected_aggregate_seq: 0,
      p_actor_kind: 'service',
      p_actor_via: 'workflow',
    })
    .throwOnError();
}
