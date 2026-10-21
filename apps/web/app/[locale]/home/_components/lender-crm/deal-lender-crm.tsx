import 'server-only';
import type { ReactNode } from 'react';

import { fundingSourceTypeSchema } from '@odb/calculators';
import {
  fetchCloseDeadline,
  loadDealTermsSought,
  saveDealTermsSought,
  setCloseDeadline,
} from '@odb/deals/server';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { CloseDeadlineForm, TermsSoughtForm } from './deal-terms';
import { LenderSpinUp } from './lender-spin-up';
import { OutreachDrafts } from './outreach-drafts';
import { TimelineAnswers } from './timeline-answers';

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className={'flex flex-col gap-4'}>
      <div className={'flex flex-col gap-1'}>
        <h2 className={'font-serif text-xl font-medium'}>{title}</h2>
        <p className={'text-muted-foreground max-w-2xl text-sm'}>
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}

export async function DealLenderCrm({
  dealId,
  accountId,
  teamPath,
}: {
  dealId: string;
  accountId: string;
  teamPath: string;
}) {
  const client = getSupabaseServerClient();

  const [
    { data: deal },
    deadline,
    termsSought,
    { data: lenders },
    { data: rooms },
  ] = await Promise.all([
    client
      .from('deal')
      .select('close_date')
      .eq('id', dealId)
      .single()
      .throwOnError(),
    fetchCloseDeadline(client, dealId),
    loadDealTermsSought(client, dealId),
    client
      .from('lender')
      .select('id, name, lender_contact(name, is_primary)')
      .eq('account_id', accountId)
      .order('name')
      .throwOnError(),
    client
      .from('lender_room')
      .select('id, name, lender_room_timeline_answer(answer, source, note, earliest_close_date)')
      .eq('deal_id', dealId)
      .order('created_at')
      .throwOnError(),
  ]);

  return (
    <div className={'flex flex-col gap-10 px-4 pb-4 md:px-8 md:pb-8'}>
      <Section
        title={'Close deadline'}
        description={
          'The date the deal must close by, and why. Lenders see it in their room and are asked whether they can close by then.'
        }
      >
        <CloseDeadlineForm
          dealId={dealId}
          targetClose={deal.close_date}
          deadline={deadline}
          save={setCloseDeadline}
        />
      </Section>
      <Section
        title={'Terms sought'}
        description={
          'What this deal asks of lenders. The outreach email includes these terms.'
        }
      >
        <TermsSoughtForm
          dealId={dealId}
          loaded={{
            source: termsSought.source,
            terms: {
              ...termsSought.terms,
              loan_type: fundingSourceTypeSchema
                .nullable()
                .parse(termsSought.terms.loan_type),
            },
          }}
          save={saveDealTermsSought}
        />
      </Section>
      <Section
        title={'Set up rooms from saved lenders'}
        description={
          'Pick saved lenders to create a room for each, with their primary contact invited. Lenders that already have a room on this deal are skipped.'
        }
      >
        <LenderSpinUp
          dealId={dealId}
          teamPath={teamPath}
          lenders={lenders.map((lender) => ({
            id: lender.id,
            name: lender.name,
            primaryName:
              lender.lender_contact.find((contact) => contact.is_primary)
                ?.name ?? null,
          }))}
        />
      </Section>
      <Section
        title={'Outreach'}
        description={
          "Draft the first email to each open room's primary contact from your team template, review it, then send from your team mailbox."
        }
      >
        <OutreachDrafts dealId={dealId} />
      </Section>
      {rooms.length > 0 ? (
        <Section
          title={'Closing timeline answers'}
          description={
            'Each lender answers whether they can close by your date in their room. Record an answer by hand when a lender tells you another way.'
          }
        >
          <TimelineAnswers
            rooms={rooms.map((room) => ({
              id: room.id,
              name: room.name,
              answer: room.lender_room_timeline_answer,
            }))}
          />
        </Section>
      ) : null}
    </div>
  );
}
