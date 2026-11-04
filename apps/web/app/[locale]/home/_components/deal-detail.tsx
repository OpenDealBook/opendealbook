import type { ReactNode } from 'react';

import { notFound } from 'next/navigation';

import { getLocale } from 'next-intl/server';

import { loadDealPeople } from '@odb/deal-people/queries.ts';
import { loadDealTimeline } from '@odb/deal-timeline/queries.ts';
import { loadDealUpdates } from '@odb/deal-updates/queries.ts';
import {
  acceptedOffer,
  fetchAccountStages,
  fetchChecklistItems,
  fetchDealOffers,
  fetchDealThesis,
} from '@odb/deals';
import { fetchCloseDeadline } from '@odb/deals/server';
import { fetchDealActivity } from '@odb/deals/shared';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { MissingValue } from '@odb/ui/figure-value';
import { formatTimestamp } from '@odb/ui/format';

import { AdoptedFinancialsCard } from './adopted-financials-card';
import { CalculatorsSection } from './calculators-section';
import { ChecklistSection } from './checklist-section';
import { CompsSection } from './comps-section';
import { CounselThreadSection } from './counsel-thread-section';
import { DealActivitySection } from './deal-activity-section';
import { DealCounselSection } from './deal-counsel-section';
import { DealPeopleSection } from './deal-people-section';
import { DealSummaryStrip, nextDeadline } from './deal-summary-strip';
import { DealTimelineSection } from './deal-timeline-section';
import { DealUpdatesSection } from './deal-updates-section';
import { OffersSection } from './offers-section';
import { ScreeningSection } from './screening-section';
import { SellerRoomSection } from './seller-room-section';
import { buildTimeline } from './stage-history';
import { ThesisSection } from './thesis-section';
import { viewerTimeZone } from './viewer-time-zone';

function dateOrNotSet(
  value: string | null,
  zone: { locale: string; timeZone: string },
): ReactNode {
  return value === null ? (
    <MissingValue label={'Not set'} />
  ) : (
    formatTimestamp(value, zone.locale, zone.timeZone)
  );
}

function textOrNotSet(value: string | number | null): string {
  return value === null ? 'Not set' : String(value);
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={'flex flex-col gap-0.5'}>
      <dt className={'text-muted-foreground text-xs uppercase'}>{label}</dt>
      <dd className={'text-sm break-words'}>{value}</dd>
    </div>
  );
}

interface DealTabProps {
  accountId: string;
  dealId: string;
}

export async function DealOverview({ accountId, dealId }: DealTabProps) {
  const client = getSupabaseServerClient();
  const [
    locale,
    timeZone,
    dealResult,
    profileResult,
    eventsResult,
    offers,
    stages,
    thesis,
    dealTimeline,
    roster,
    activity,
    financialsResult,
    closeDeadline,
    { count: openLenderAsks },
    { count: checklistWaitingOnUs },
  ] = await Promise.all([
    getLocale(),
    viewerTimeZone(accountId),
    client
      .from('deal')
      .select('*')
      .eq('id', dealId)
      .eq('account_id', accountId)
      .maybeSingle(),
    client
      .from('deal_profile')
      .select('*, industry(name), location(city, region)')
      .eq('deal_id', dealId)
      .maybeSingle(),
    client
      .from('deal_event')
      .select('*')
      .eq('deal_id', dealId)
      .in('aggregate_type', ['deal', 'deal_update'])
      .order('deal_seq', { ascending: true }),
    fetchDealOffers(client, { deal_id: dealId }),
    fetchAccountStages(client, accountId),
    fetchDealThesis(client, { deal_id: dealId }),
    loadDealTimeline(client, dealId),
    loadDealPeople({ dealId, accountId }),
    fetchDealActivity(client, dealId, accountId, 0),
    client
      .from('deal_financials')
      .select('adopted_sde, adopted_ebitda')
      .eq('deal_id', dealId)
      .maybeSingle()
      .throwOnError(),
    fetchCloseDeadline(client, dealId),
    client
      .from('lender_ask')
      .select('id, lender_room!inner(deal_id)', { count: 'exact', head: true })
      .eq('lender_room.deal_id', dealId)
      .eq('status', 'open')
      .throwOnError(),
    client
      .from('checklist_item')
      .select('id', { count: 'exact', head: true })
      .eq('deal_id', dealId)
      .eq('waiting_on', 'us')
      .throwOnError(),
  ]);
  const zone = { locale, timeZone };

  const deal = dealResult.data;

  if (!deal) {
    notFound();
  }

  const profile = profileResult.data;
  const events = eventsResult.data ?? [];

  const stageLabel = new Map(stages.map((stage) => [stage.key, stage.label]));
  const stageName = (key: string) => stageLabel.get(key) ?? key;

  const accepted = acceptedOffer(offers);

  const locationParts = [
    profile?.location?.city,
    profile?.location?.region,
  ].filter((part): part is string => Boolean(part));
  const locationName =
    locationParts.length > 0
      ? locationParts.join(', ')
      : (profile?.location_raw ?? null);
  const timeline = buildTimeline(
    events,
    stageName,
    new Map(
      roster.people.flatMap((person) =>
        person.user_id === null ? [] : [[person.user_id, person.name]],
      ),
    ),
  );

  return (
    <>
      <DealSummaryStrip
        stage={{ key: deal.stage, label: stageName(deal.stage) }}
        lost={deal.resolution === 'lost'}
        asking={deal.asking_price}
        basis={deal.earnings_basis === 'ebitda' ? 'ebitda' : 'sde'}
        adoptedSde={financialsResult.data?.adopted_sde ?? null}
        adoptedEbitda={financialsResult.data?.adopted_ebitda ?? null}
        deadline={nextDeadline(
          dealTimeline.milestones,
          closeDeadline?.must_close_by ?? null,
        )}
        waitingOnUs={openLenderAsks! + checklistWaitingOnUs!}
      />

      <DealTimelineSection dealId={deal.id} timeline={dealTimeline} />

      <div className={'grid items-start gap-6 lg:grid-cols-2'}>
        <div className={'flex min-w-0 flex-col gap-6'}>
          <DealActivitySection
            dealId={deal.id}
            accountId={accountId}
            first={activity}
          />

          <DealUpdatesSection
            dealId={deal.id}
            board={await loadDealUpdates({
              dealId: deal.id,
              accountId,
              roster,
            })}
          />
        </div>

        <div className={'flex min-w-0 flex-col gap-6'}>
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className={'grid grid-cols-2 gap-4 sm:grid-cols-3'}>
                <Field
                  label={'Industry'}
                  value={textOrNotSet(profile?.industry?.name ?? null)}
                />
                <Field label={'Location'} value={textOrNotSet(locationName)} />
                <Field
                  label={'Year established'}
                  value={textOrNotSet(profile?.year_established ?? null)}
                />
                <Field
                  label={'Employees'}
                  value={textOrNotSet(profile?.employee_band ?? null)}
                />
                <Field
                  label={'Website'}
                  value={textOrNotSet(profile?.website ?? null)}
                />
                <Field
                  label={'Owner role'}
                  value={textOrNotSet(profile?.owner_role ?? null)}
                />
                <Field
                  label={'Reason for sale'}
                  value={textOrNotSet(profile?.reason_for_sale ?? null)}
                />
              </dl>
            </CardContent>
          </Card>

          <ThesisSection deal_id={deal.id} thesis={thesis} />

          <Card>
            <CardHeader>
              <CardTitle>Stage history</CardTitle>
            </CardHeader>
            <CardContent className={'flex flex-col gap-6'}>
              <div className={'flex flex-col gap-2'}>
                {timeline.length === 0 ? (
                  <p className={'text-muted-foreground text-sm'}>
                    No events yet
                  </p>
                ) : (
                  timeline.map((entry) => (
                    <div
                      key={entry.id}
                      className={
                        'flex flex-wrap items-baseline gap-x-2 text-sm'
                      }
                    >
                      <span>
                        {entry.label} by {entry.actor}
                      </span>
                      <span className={'text-muted-foreground text-xs'}>
                        {dateOrNotSet(entry.at, zone)}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <dl className={'grid grid-cols-2 gap-4 sm:grid-cols-3'}>
                <Field
                  label={'Discovered'}
                  value={dateOrNotSet(deal.discovered_at, zone)}
                />
                <Field
                  label={'Stage changed'}
                  value={dateOrNotSet(deal.stage_changed_at, zone)}
                />
                <Field
                  label={'Offer accepted'}
                  value={dateOrNotSet(
                    accepted?.offer.responded_at ?? null,
                    zone,
                  )}
                />
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

export async function DealDiligence({ accountId, dealId }: DealTabProps) {
  const checklist = await fetchChecklistItems(
    getSupabaseServerClient(),
    dealId,
  );

  return (
    <ChecklistSection items={checklist} dealId={dealId} accountId={accountId} />
  );
}

export async function DealParties({ accountId, dealId }: DealTabProps) {
  const roster = await loadDealPeople({ dealId, accountId });

  return (
    <>
      <DealPeopleSection dealId={dealId} roster={roster} />
      <SellerRoomSection dealId={dealId} />
      <DealCounselSection dealId={dealId} />
      <CounselThreadSection dealId={dealId} />
    </>
  );
}

export async function DealFinancials({ accountId, dealId }: DealTabProps) {
  const client = getSupabaseServerClient();
  const [{ data: financials }, { data: people }] = await Promise.all([
    client
      .from('deal_financials')
      .select(
        '*, calc_version(id, name, type, created_at, updated_at, outputs_snapshot)',
      )
      .eq('deal_id', dealId)
      .maybeSingle()
      .throwOnError(),
    client.rpc('deal_people', { deal_id: dealId }).throwOnError(),
  ]);
  const adoptedBy =
    financials === null
      ? null
      : (people.find((person) => person.user_id === financials.adopted_by)
          ?.name ?? 'A former participant');

  return (
    <>
      <AdoptedFinancialsCard
        accountId={accountId}
        financials={financials}
        calc={financials?.calc_version ?? null}
        adoptedBy={adoptedBy}
      />
      <CalculatorsSection dealId={dealId} accountId={accountId} />
      <CompsSection dealId={dealId} accountId={accountId} />
      <OffersSection dealId={dealId} accountId={accountId} />
      <ScreeningSection dealId={dealId} />
    </>
  );
}
