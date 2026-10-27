import { ApplicationFailure } from '@temporalio/common';
import { z } from 'zod';

import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { uuidFromKey } from '../../uuidFromKey';
import { NODE_CONFIG_SCHEMAS, type NodeConfig } from '../graph';
import { defineStep } from '../step';

const bound = z
  .number()
  .nullish()
  .transform((value) => value ?? undefined);

const range = z.object({ min: bound, max: bound }).prefault({});

const dealBoxFilters = z.object({
  states: z.array(z.string()).default([]),
  size: z
    .object({
      jobs: range,
      pppLoanAmount: range,
      form5500Participants: range,
      minBusinessAgeYears: bound,
    })
    .prefault({}),
});

type Widen = NonNullable<NodeConfig<'pull_leads'>['widen']>;

type PullFilters = Omit<Widen, 'states'> & { states: string[] };

function refuseNarrower(field: string): never {
  throw ApplicationFailure.nonRetryable(
    `This pull is narrower than your deal box on ${field}. A pull may only go wider.`,
  );
}

function widenedFilters(dealBox: z.output<typeof dealBoxFilters>, widen: Widen): PullFilters {
  const filters: PullFilters = {
    states: dealBox.states,
    minJobs: dealBox.size.jobs.min,
    maxJobs: dealBox.size.jobs.max,
    minPppLoan: dealBox.size.pppLoanAmount.min,
    maxPppLoan: dealBox.size.pppLoanAmount.max,
    minAgeYears: dealBox.size.minBusinessAgeYears,
    minHeadcount: dealBox.size.form5500Participants.min,
    maxHeadcount: dealBox.size.form5500Participants.max,
  };
  for (const field of ['minJobs', 'minPppLoan', 'minAgeYears', 'minHeadcount'] as const) {
    const wider = widen[field];
    if (wider !== undefined) {
      if (wider > (filters[field] ?? 0)) refuseNarrower(field);
      filters[field] = wider;
    }
  }
  for (const field of ['maxJobs', 'maxPppLoan', 'maxHeadcount'] as const) {
    const wider = widen[field];
    if (wider !== undefined) {
      if (filters[field] === undefined || wider < filters[field]) refuseNarrower(field);
      filters[field] = wider;
    }
  }
  if (widen.states !== undefined) {
    const wider: string[] = widen.states;
    if (filters.states.length === 0 || !filters.states.every((state) => wider.includes(state))) {
      refuseNarrower('states');
    }
    filters.states = wider;
  }
  return filters;
}

export const pullLeads = defineStep({
  type: 'pull_leads',
  runOnce: false,
  configSchema: NODE_CONFIG_SCHEMAS.pull_leads,
  inputSchema: z.object({}),
  outputSchema: z.object({ firmIds: z.array(z.string()), count: z.number() }),
  async run({ context, config }) {
    const admin = getSupabaseServerAdminClient();
    const { data: dealBox } = await admin
      .from('deal_box')
      .select('criteria_json')
      .eq('account_id', context.accountId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
      .throwOnError();
    if (!dealBox) {
      throw ApplicationFailure.nonRetryable('Set your deal box before pulling leads.');
    }
    const filters = widenedFilters(dealBoxFilters.parse(dealBox.criteria_json), config.widen ?? {});

    const { data: firmIds } = await admin
      .rpc('pull_leads', {
        p_pull_id: uuidFromKey(`workflow_step:${context.idempotencyKey}`),
        p_account_id: context.accountId,
        p_sources: config.sources,
        p_states: filters.states,
        p_min_jobs: filters.minJobs,
        p_max_jobs: filters.maxJobs,
        p_min_ppp_loan: filters.minPppLoan,
        p_max_ppp_loan: filters.maxPppLoan,
        p_min_age_years: filters.minAgeYears,
        p_min_headcount: filters.minHeadcount,
        p_max_headcount: filters.maxHeadcount,
        p_limit: config.limit,
      })
      .throwOnError();
    return { firmIds, count: firmIds.length };
  },
});
