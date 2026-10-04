import { notFound } from 'next/navigation';

import { earningsMargin, earningsMultiple } from '@odb/calculators';
import {
  fetchAccountStages,
  fetchChecklistItems,
  fetchDealOffer,
  fetchDealThesis,
} from '@odb/deals';
import { isLoiSigned, listSellerQuestions } from '@odb/diligence/server';
import type { Tables } from '@odb/supabase';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { Badge } from '@odb/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';

import { CalculatorsSection } from './calculators-section';
import { ChecklistSection } from './checklist-section';
import { CompsSection } from './comps-section';
import { DealHeaderActions } from './deal-detail-actions';
import { DealIntakeRerun } from './deal-intake-rerun';
import { EarningsBasisToggle } from './earnings-basis-toggle';
import { OffersSection } from './offers-section';
import { ScreeningSection } from './screening-section';
import { SellerQuestionsSection } from './seller-questions-section';
import { ThesisSection } from './thesis-section';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function money(value: number | null): string {
  return value === null ? 'Not disclosed' : currency.format(value);
}

function dateOrNotSet(value: string | null): string {
  return value === null ? 'Not set' : new Date(value).toLocaleDateString('en-US');
}

function textOrNotSet(value: string | number | null): string {
  return value === null ? 'Not set' : String(value);
}

function resolutionText(
  resolution: string | null,
  reason: string | null,
): string {
  if (resolution === null) {
    return 'Open';
  }
  const outcome = resolution === 'won' ? 'Won' : 'Lost';
  return reason === null ? outcome : `${outcome} (${reason.replace(/_/g, ' ')})`;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className={'flex flex-col gap-0.5'}>
      <dt className={'text-muted-foreground text-xs uppercase'}>{label}</dt>
      <dd className={'text-sm'}>{value}</dd>
    </div>
  );
}

export async function DealDetail({
  accountId,
  dealId,
}: {
  accountId: string;
  dealId: string;
}) {
  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  const [
    dealResult,
    profileResult,
    financialsResult,
    eventsResult,
    checklist,
    offer,
    stages,
    thesis,
    sellerQuestions,
    loiSigned,
  ] =
    await Promise.all([
      client
        .from('deal')
        .select('*, deal_star(user_id)')
        .eq('id', dealId)
        .eq('account_id', accountId)
        .maybeSingle(),
      client
        .from('deal_profile')
        .select('*, industry(name), location(city, region)')
        .eq('deal_id', dealId)
        .maybeSingle(),
      client
        .from('deal_financials')
        .select('*')
        .eq('deal_id', dealId)
        .maybeSingle(),
      client
        .from('deal_event')
        .select('*')
        .eq('deal_id', dealId)
        .eq('aggregate_type', 'deal')
        .order('deal_seq', { ascending: true }),
      fetchChecklistItems(client, dealId),
      fetchDealOffer(client, { deal_id: dealId }),
      fetchAccountStages(client, accountId),
      fetchDealThesis(client, { deal_id: dealId }),
      listSellerQuestions(client, dealId),
      isLoiSigned(client, dealId),
    ]);

  const deal = dealResult.data;

  if (!deal) {
    notFound();
  }

  const profile = profileResult.data;
  const financials = financialsResult.data;
  const events = eventsResult.data ?? [];

  const stageLabel = new Map(stages.map((stage) => [stage.key, stage.label]));
  const stageName = (key: string) => stageLabel.get(key) ?? key;

  const starred = deal.deal_star.some((star) => star.user_id === user?.id);

  const title = (deal.description ?? 'Untitled deal').replace(/^Example:\s*/, '');
  const asking = deal.asking_price;
  const revenue = financials?.adopted_revenue ?? deal.revenue_ttm;
  const sde = financials?.adopted_sde ?? deal.sde_ttm;
  const ebitda = financials?.adopted_ebitda ?? deal.ebitda_ttm;
  const basis = deal.earnings_basis === 'ebitda' ? 'ebitda' : 'sde';
  const earnings = basis === 'ebitda' ? ebitda : sde;
  const earningsLabel = basis === 'ebitda' ? 'EBITDA' : 'SDE';
  const multiple = earningsMultiple(basis, asking, sde, ebitda);
  const margin = earningsMargin(basis, revenue, sde, ebitda);

  const timeline = buildTimeline(events, stageName);

  const acceptedVersion =
    offer?.versions.find((version) => version.approved_at !== null) ?? null;

  const locationParts = [profile?.location?.city, profile?.location?.region].filter(
    (part): part is string => Boolean(part),
  );
  const locationName =
    locationParts.length > 0
      ? locationParts.join(', ')
      : profile?.location_raw ?? null;

  return (
    <div className={'flex flex-col gap-6'}>
      <Card>
        <CardHeader>
          <CardTitle className={'flex flex-wrap items-center gap-2 text-xl'}>
            {title}
            {deal.capture_method === 'example' ? (
              <Badge variant={'secondary'}>Example</Badge>
            ) : null}
            <Badge variant={'outline'}>{stageName(deal.stage)}</Badge>
            <Badge variant={'outline'}>
              {resolutionText(deal.resolution, deal.resolution_reason)}
            </Badge>
            <Badge variant={'outline'}>{deal.listing_status}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className={'flex flex-col gap-6'}>
          <dl className={'grid grid-cols-2 gap-4 sm:grid-cols-5'}>
            <Field label={'Asking'} value={money(asking)} />
            <Field label={'Revenue'} value={money(revenue)} />
            <Field label={earningsLabel} value={money(earnings)} />
            <Field
              label={`${earningsLabel} multiple`}
              value={multiple === null ? 'Not disclosed' : `${multiple.toFixed(1)}x`}
            />
            <Field
              label={`${earningsLabel} margin`}
              value={
                margin === null ? 'Not disclosed' : `${Math.round(margin * 100)}%`
              }
            />
          </dl>
          <EarningsBasisToggle dealId={deal.id} basis={basis} />
          <DealIntakeRerun dealId={deal.id} />
          <DealHeaderActions
            dealId={deal.id}
            stage={deal.stage}
            stages={stages.map((stage) => ({ key: stage.key, label: stage.label }))}
            listingStatus={deal.listing_status}
            archived={deal.archived_at !== null}
            starred={starred}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className={'grid grid-cols-2 gap-4 sm:grid-cols-3'}>
            <Field label={'Industry'} value={textOrNotSet(profile?.industry?.name ?? null)} />
            <Field label={'Location'} value={textOrNotSet(locationName)} />
            <Field
              label={'Year established'}
              value={textOrNotSet(profile?.year_established ?? null)}
            />
            <Field label={'Employees'} value={textOrNotSet(profile?.employee_band ?? null)} />
            <Field label={'Website'} value={textOrNotSet(profile?.website ?? null)} />
            <Field label={'Owner role'} value={textOrNotSet(profile?.owner_role ?? null)} />
            <Field
              label={'Reason for sale'}
              value={textOrNotSet(profile?.reason_for_sale ?? null)}
            />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adopted financials</CardTitle>
        </CardHeader>
        <CardContent>
          {financials === null ? (
            <p className={'text-muted-foreground text-sm'}>
              No financials adopted yet
            </p>
          ) : (
            <dl className={'grid grid-cols-2 gap-4 sm:grid-cols-3'}>
              <Field label={'Revenue'} value={money(financials.adopted_revenue)} />
              <Field label={'SDE'} value={money(financials.adopted_sde)} />
              <Field label={'EBITDA'} value={money(financials.adopted_ebitda)} />
              <Field label={'Adopted at'} value={dateOrNotSet(financials.adopted_at)} />
              <Field
                label={'Source calc version'}
                value={textOrNotSet(financials.source_calc_version_id)}
              />
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stage history and key dates</CardTitle>
        </CardHeader>
        <CardContent className={'flex flex-col gap-6'}>
          <div className={'flex flex-col gap-2'}>
            {timeline.length === 0 ? (
              <p className={'text-muted-foreground text-sm'}>No events yet</p>
            ) : (
              timeline.map((entry) => (
                <div
                  key={entry.id}
                  className={'flex flex-wrap items-baseline gap-x-2 text-sm'}
                >
                  <span>{entry.label}</span>
                  <span className={'text-muted-foreground text-xs'}>
                    {dateOrNotSet(entry.at)} · {entry.actor}
                  </span>
                </div>
              ))
            )}
          </div>
          <dl className={'grid grid-cols-2 gap-4 sm:grid-cols-3'}>
            <Field label={'Discovered'} value={dateOrNotSet(deal.discovered_at)} />
            <Field label={'Stage changed'} value={dateOrNotSet(deal.stage_changed_at)} />
            <Field
              label={'Offer accepted'}
              value={dateOrNotSet(acceptedVersion?.approved_at ?? null)}
            />
            <Field
              label={'Target close'}
              value={dateOrNotSet(acceptedVersion?.target_close_date ?? null)}
            />
            <Field
              label={'Offer expires'}
              value={dateOrNotSet(acceptedVersion?.offer_expires_at ?? null)}
            />
          </dl>
        </CardContent>
      </Card>

      <ThesisSection deal_id={deal.id} thesis={thesis} />

      <SellerQuestionsSection
        dealId={deal.id}
        questions={sellerQuestions ?? []}
        loiSigned={loiSigned}
      />

      <ChecklistSection items={checklist} dealId={dealId} accountId={accountId} />

      <ScreeningSection dealId={deal.id} />

      <OffersSection dealId={deal.id} accountId={accountId} />
      <CalculatorsSection dealId={deal.id} accountId={accountId} />
      <CompsSection dealId={deal.id} accountId={accountId} />
    </div>
  );
}

interface TimelineEntry {
  id: string;
  label: string;
  at: string;
  actor: string;
}

function buildTimeline(
  events: Tables<'deal_event'>[],
  stageName: (key: string) => string,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  let lastStage: string | null = null;

  for (const event of events) {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const stage = typeof payload.stage === 'string' ? payload.stage : null;

    if (event.event_type === 'deal.created') {
      lastStage = stage;
      entries.push({
        id: event.id,
        label: stage === null ? 'Created' : `Created in ${stageName(stage)}`,
        at: event.created_at,
        actor: event.actor_kind,
      });
    } else if (event.event_type === 'deal.stage_changed') {
      const from = lastStage;
      lastStage = stage;
      entries.push({
        id: event.id,
        label: `${from === null ? 'Unknown' : stageName(from)} -> ${
          stage === null ? 'Unknown' : stageName(stage)
        }`,
        at: event.created_at,
        actor: event.actor_kind,
      });
    } else if (event.event_type === 'deal.resolved') {
      const resolution =
        typeof payload.resolution === 'string' ? payload.resolution : 'closed';
      const reason =
        typeof payload.resolution_reason === 'string'
          ? payload.resolution_reason
          : null;
      entries.push({
        id: event.id,
        label: `Resolved ${resolution}${
          reason === null ? '' : ` (${reason.replace(/_/g, ' ')})`
        }`,
        at: event.created_at,
        actor: event.actor_kind,
      });
    }
  }

  return entries;
}
