import type { SupabaseClient } from '@supabase/supabase-js';

import type { TriggerNotificationInput } from '@odb/notifications/server';
import type { Database } from '@odb/supabase';

import type {
  GatherContext,
  ReconciliationCheck,
  ReconciliationFinding,
} from './contract';
import { toFindingRow } from './persistence';

export const VERIFICATION_EVENT_TYPE = 'verification.findings';

export interface RunnableCheck<TInput> {
  check: ReconciliationCheck<TInput>;
  gather(ctx: GatherContext): Promise<TInput>;
}

export type Notifier = (
  input: TriggerNotificationInput,
) => Promise<unknown>;

export interface RunVerificationOptions {
  client: SupabaseClient<Database>;
  dealId: string;
  trigger: string;
  runnableChecks: RunnableCheck<unknown>[];
  notify: Notifier;
  period?: string;
}

export interface RunVerificationResult {
  runId: string;
  status: 'done';
  findingCount: number;
}

function isActionable(finding: ReconciliationFinding): boolean {
  return finding.severity === 'warning' || finding.severity === 'error';
}

export async function runVerification(
  options: RunVerificationOptions,
): Promise<RunVerificationResult> {
  const { client, dealId, trigger, runnableChecks, notify, period } = options;

  const { data: deal, error: dealError } = await client
    .from('deal')
    .select('account_id, owner_user_id')
    .eq('id', dealId)
    .single();

  if (dealError) {
    throw dealError;
  }

  const { data: run, error: runError } = await client
    .from('verification_run')
    .insert({
      account_id: deal.account_id,
      deal_id: dealId,
      status: 'running',
      trigger,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (runError) {
    throw runError;
  }

  try {
    const findings: ReconciliationFinding[] = [];

    for (const runnable of runnableChecks) {
      const input = await runnable.gather({ dealId, period: period ?? '' });
      findings.push(...runnable.check.evaluate(input));
    }

    if (findings.length > 0) {
      const rows = findings.map((finding) =>
        toFindingRow(finding, {
          runId: run.id,
          accountId: deal.account_id,
          dealId,
        }),
      );

      const { error: findingError } = await client
        .from('verification_finding')
        .insert(rows);

      if (findingError) {
        throw findingError;
      }
    }

    const { error: doneError } = await client
      .from('verification_run')
      .update({ status: 'done', finished_at: new Date().toISOString() })
      .eq('id', run.id);

    if (doneError) {
      throw doneError;
    }

    const actionable = findings.filter(isActionable);

    if (actionable.length > 0 && deal.owner_user_id) {
      await notify({
        eventType: VERIFICATION_EVENT_TYPE,
        recipientUserId: deal.owner_user_id,
        payload: {
          dealId,
          runId: run.id,
          errorCount: actionable.filter((f) => f.severity === 'error').length,
          warningCount: actionable.filter((f) => f.severity === 'warning')
            .length,
        },
      });
    }

    return { runId: run.id, status: 'done', findingCount: findings.length };
  } catch (error) {
    await client
      .from('verification_run')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
      })
      .eq('id', run.id);

    throw error;
  }
}
