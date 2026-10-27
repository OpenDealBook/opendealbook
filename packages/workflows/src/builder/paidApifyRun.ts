import { ApplicationFailure } from '@temporalio/common';
import type { z } from 'zod';

import type { Json } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { pinnedPost } from './aiClient';
import { recordLookup, reserveLookup } from './caps';
import { parsedJson } from './teamAi';

const APIFY_RUN_TIMEOUT_MS = 240_000;
const KEY_REFUSED_STATUSES = new Set([401, 402, 403]);

export const APIFY_KEY_REFUSED = 'ApifyKeyRefused';

export interface PaidRunContext {
  accountId: string;
  firmId: string;
  dealId?: string;
  credentials: { apiKey: string; provider: string; baseUrl: string };
  signal?: AbortSignal;
}

export async function recordedResult<Result>(lookupId: string, result: z.ZodType<Result>): Promise<Result | null> {
  const { data: recorded } = await getSupabaseServerAdminClient()
    .from('paid_lookup')
    .select('result')
    .eq('id', lookupId)
    .neq('outcome', 'failed')
    .maybeSingle()
    .throwOnError();
  return recorded && result.parse(recorded.result);
}

export async function paidApifyRun<Result>(
  context: PaidRunContext,
  run: {
    lookupId: string;
    actor: { id: string; provider: string };
    input: unknown;
    result: z.ZodType<Result>;
    found: (result: Result) => boolean;
    beforeRecord?: (result: Result) => Promise<void>;
  },
): Promise<Result> {
  const recorded = await recordedResult(run.lookupId, run.result);
  if (recorded !== null) {
    return recorded;
  }

  await reserveLookup({
    id: run.lookupId,
    accountId: context.accountId,
    firmId: context.firmId,
    dealId: context.dealId,
    provider: context.credentials.provider,
  });

  const response = await pinnedPost(
    `${context.credentials.baseUrl}/acts/${run.actor.id.replace('/', '~')}/run-sync-get-dataset-items`,
    { authorization: `Bearer ${context.credentials.apiKey}` },
    run.input,
    { timeoutMs: APIFY_RUN_TIMEOUT_MS, signal: context.signal },
  );
  const body = parsedJson(response.text) as Json | undefined;
  const failedResult =
    body === undefined ? { status: response.status, text: response.text } : { status: response.status, body };

  if (response.status >= 300) {
    await recordLookup(run.lookupId, { outcome: 'failed', result: failedResult });
    const message = `The ${run.actor.provider} provider answered ${response.status}`;
    if (response.status >= 500 || response.status === 429) {
      throw new Error(message);
    }
    throw ApplicationFailure.nonRetryable(
      message,
      KEY_REFUSED_STATUSES.has(response.status) ? APIFY_KEY_REFUSED : undefined,
    );
  }
  if (body === undefined) {
    await recordLookup(run.lookupId, { outcome: 'failed', result: failedResult });
    throw ApplicationFailure.nonRetryable(
      `The ${run.actor.provider} provider answered with something that is not JSON`,
    );
  }

  const result = run.result.parse(body);
  await run.beforeRecord?.(result);
  await recordLookup(run.lookupId, { outcome: run.found(result) ? 'found' : 'not_found', result: body });
  return result;
}
