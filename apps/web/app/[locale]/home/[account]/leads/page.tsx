import type { QueryData } from '@supabase/supabase-js';

import { getSupabaseServerClient } from '@odb/supabase/server';

import { type LeadRow, LeadsPipeline } from '../../_components/leads-pipeline';
import { parseLeadParams } from '../../_components/leads-search-params';
import {
  type MatchReview,
  MatchReviewList,
} from '../../_components/match-review-list';
import { loadTeamWorkspace } from '../layout';
import { decideMatchReview } from './match-review-actions';

const PAGE_SIZE = 50;

function place(city: string | null, state: string | null): string | null {
  return [city, state].filter(Boolean).join(', ') || null;
}

const REVIEW_COLUMNS =
  'id, reason, score, public_business(name, ein), ppp_loan(borrower_name, city, state), sba_loan(program, borrower_name, city, state), form_5500_filing(sponsor_name, city, state, ein), state_registry_entity(name, mailing_city, mailing_state)';

function pendingReviews(accountId: string) {
  return getSupabaseServerClient()
    .from('business_match_review')
    .select(REVIEW_COLUMNS)
    .eq('account_id', accountId)
    .eq('status', 'pending')
    .order('created_at');
}

type PendingReview = QueryData<ReturnType<typeof pendingReviews>>[number];

function recordOf(review: PendingReview) {
  if (review.ppp_loan) {
    return {
      source: 'ppp' as const,
      recordName: review.ppp_loan.borrower_name,
      recordLocation: place(review.ppp_loan.city, review.ppp_loan.state),
    };
  }
  if (review.sba_loan) {
    return {
      source: review.sba_loan.program,
      recordName: review.sba_loan.borrower_name,
      recordLocation: place(review.sba_loan.city, review.sba_loan.state),
    };
  }
  if (review.form_5500_filing) {
    return {
      source: 'form_5500' as const,
      recordName: review.form_5500_filing.sponsor_name,
      recordLocation: place(
        review.form_5500_filing.city,
        review.form_5500_filing.state,
      ),
    };
  }
  const entity = review.state_registry_entity!;

  return {
    source: 'state_registry' as const,
    recordName: entity.name,
    recordLocation: place(entity.mailing_city, entity.mailing_state),
  };
}

export default async function LeadsPage({
  params,
  searchParams,
}: {
  params: Promise<{ account: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { account } = await params;
  const { filters, page } = parseLeadParams(await searchParams);
  const { team, permissions } = await loadTeamWorkspace(account);
  const canManageDeals = permissions.includes('deals.manage');
  const basePath = `/home/${account}/leads`;
  const workflowsHref = `/home/${account}/workflows`;

  const client = getSupabaseServerClient();
  let pipeline = client
    .from('lead_pipeline')
    .select('*', { count: 'exact' })
    .eq('account_id', team.id);

  if (filters.verdict === 'none') {
    pipeline = pipeline.is('verdict', null);
  } else if (filters.verdict) {
    pipeline = pipeline.eq('verdict', filters.verdict);
  }
  if (filters.source) {
    pipeline = pipeline.contains('sources', [filters.source]);
  }
  if (filters.state) {
    pipeline = pipeline.eq('state', filters.state);
  }
  if (filters.q) {
    pipeline = pipeline.ilike('name', `%${filters.q}%`);
  }

  const [{ data: firms, count }, { data: states }, { data: reviews }] =
    await Promise.all([
      pipeline
        .order('name')
        .order('firm_id')
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
        .throwOnError(),
      client
        .from('lead_pipeline_state')
        .select('state')
        .eq('account_id', team.id)
        .order('state')
        .throwOnError(),
      pendingReviews(team.id).throwOnError(),
    ]);

  const rows: LeadRow[] = firms.map((firm) => ({
    firmId: firm.firm_id!,
    name: firm.name!,
    city: firm.city,
    state: firm.state,
    jobs: firm.jobs,
    pppLoanAmount: firm.ppp_loan_amount,
    headcount: firm.headcount,
    businessAgeYears: firm.business_age_years,
    sources: firm.sources!,
    needsReview: firm.needs_review!,
    verdict: firm.verdict as LeadRow['verdict'],
    approval: firm.approval as LeadRow['approval'],
    emailCount: firm.email_count!,
    outreach: firm.outreach as LeadRow['outreach'],
  }));

  const pending: MatchReview[] = reviews.map((review) => {
    const common = {
      id: review.id,
      score: review.score,
      candidateName: review.public_business.name,
      ...recordOf(review),
    };

    return review.reason === 'ein_conflict'
      ? {
          ...common,
          reason: 'ein_conflict',
          recordEin: review.form_5500_filing!.ein,
          candidateEin: review.public_business.ein!,
        }
      : { ...common, reason: 'weak_match' };
  });

  return (
    <main className={'flex min-w-0 flex-col gap-8 p-4 md:p-8'}>
      <div className={'flex flex-col gap-1'}>
        <h1 className={'font-serif text-2xl font-medium'}>Leads</h1>
        <p className={'text-muted-foreground max-w-prose text-sm'}>
          Firms your workflows pulled from public records, with what the team
          has learned about each and where its outreach stands.
        </p>
      </div>
      <section className={'flex min-w-0 flex-col gap-4'}>
        <h2 className={'text-lg font-semibold'}>Pipeline</h2>
        <LeadsPipeline
          rows={rows}
          total={count!}
          page={page}
          pageSize={PAGE_SIZE}
          filters={filters}
          stateOptions={states.map((each) => each.state!)}
          basePath={basePath}
          workflowsHref={workflowsHref}
          approvalsHref={canManageDeals ? `/home/${account}/approvals` : null}
        />
      </section>
      <section className={'flex min-w-0 flex-col gap-4'}>
        <h2 className={'text-lg font-semibold'}>Weak matches to review</h2>
        <MatchReviewList
          reviews={pending}
          canDecide={canManageDeals}
          workflowsHref={workflowsHref}
          decide={decideMatchReview}
        />
      </section>
    </main>
  );
}
