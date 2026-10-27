import { ApplicationFailure } from '@temporalio/common';
import { z } from 'zod';

import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { uuidFromKey } from '../../uuidFromKey';
import { NODE_CONFIG_SCHEMAS } from '../graph';
import { defineStep } from '../step';
import { teamRow } from '../teamRow';
import { askTeamAi, parsedJson } from '../teamAi';

const verdictSchema = z.object({ fit: z.boolean(), reasons: z.array(z.string()) });

const FIRM_FIELDS =
  'name, industry, city, state, employee_band, established_year, naics_code, revenue_estimate, profile, service_mix_json';

function decisionPrompt(args: {
  firm: unknown;
  dealBox: unknown;
  facts: string[];
  instructions?: string;
}): string {
  return [
    'Decide whether this firm fits our deal box as an acquisition target.',
    'Answer only with JSON of the shape {"fit": boolean, "reasons": string[]}.',
    args.instructions ?? '',
    `Deal box: ${JSON.stringify(args.dealBox)}`,
    `What our team has taught you: ${JSON.stringify(args.facts)}`,
    `Firm: ${JSON.stringify(args.firm)}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export const decisionModel = defineStep({
  type: 'decision_model',
  runOnce: false,
  configSchema: NODE_CONFIG_SCHEMAS.decision_model,
  inputSchema: z.object({}),
  outputSchema: z.object({
    verdictId: z.string(),
    fit: z.boolean(),
    reasons: z.array(z.string()),
  }),
  async run({ context, config }) {
    const admin = getSupabaseServerAdminClient();
    const verdictId = uuidFromKey(`workflow_step:${context.idempotencyKey}`);

    const { data: recorded } = await admin
      .from('firm_verdict')
      .select('id, fit, reasons')
      .eq('id', verdictId)
      .maybeSingle()
      .throwOnError();
    if (recorded) {
      return { verdictId: recorded.id, fit: recorded.fit, reasons: recorded.reasons };
    }

    const firm = await teamRow(config.firmId, 'That firm is not on this team', (id) =>
      getSupabaseServerAdminClient()
        .from('firm')
        .select(FIRM_FIELDS)
        .eq('id', id)
        .eq('account_id', context.accountId)
        .maybeSingle()
        .throwOnError(),
    );

    const [{ data: dealBox }, { data: facts }] = await Promise.all([
      admin
        .from('deal_box')
        .select('criteria_json, broker_summary, min_dscr, required_personal_cash_flow')
        .eq('account_id', context.accountId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()
        .throwOnError(),
      admin
        .from('decision_fact')
        .select('body')
        .eq('account_id', context.accountId)
        .order('created_at')
        .throwOnError(),
    ]);
    if (!dealBox) {
      throw ApplicationFailure.nonRetryable('Set your deal box before using the decision model.');
    }

    const answer = await askTeamAi({
      accountId: context.accountId,
      firmId: config.firmId,
      signal: context.signal,
      prompt: decisionPrompt({
        firm,
        dealBox,
        facts: facts.map((fact) => fact.body),
        instructions: config.instructions,
      }),
    });

    const verdict = verdictSchema.safeParse(parsedJson(answer.text));
    if (!verdict.success) {
      throw ApplicationFailure.nonRetryable('The AI did not answer with a fit and reasons');
    }

    await admin
      .from('firm_verdict')
      .insert({
        id: verdictId,
        account_id: context.accountId,
        firm_id: config.firmId,
        endpoint_id: answer.endpointId,
        fit: verdict.data.fit,
        reasons: verdict.data.reasons,
        model: answer.model,
      })
      .throwOnError();

    return { verdictId, ...verdict.data };
  },
});
