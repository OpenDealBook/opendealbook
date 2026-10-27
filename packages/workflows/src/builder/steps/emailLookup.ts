import { ApplicationFailure } from '@temporalio/common';
import { getDomain } from 'tldts';
import { z } from 'zod';

import type { Json } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { uuidFromKey } from '../../uuidFromKey';
import { pinnedPost } from '../aiClient';
import { recordLookup, reserveLookup } from '../caps';
import { NODE_CONFIG_SCHEMAS } from '../graph';
import { providerKey } from '../providerKeys';
import { defineStep } from '../step';
import { parsedJson } from '../teamAi';
import { teamRow } from '../teamRow';

const APIFY_RUN_TIMEOUT_MS = 240_000;

const datasetItems = z.array(z.object({ emails: z.array(z.string()) }).loose());

const MACHINE_MAILBOXES = new Set(['noreply', 'no-reply', 'postmaster']);

function websiteUrl(website: string): string {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(website) ? website : `https://${website}`;
}

function isFirmMailbox(email: string, firmDomain: string | null): boolean {
  const [mailbox, host] = email.split('@');
  return !MACHINE_MAILBOXES.has(mailbox!) && host !== undefined && getDomain(host) === firmDomain;
}

function lookupOutcome(result: Json, website: string) {
  const firmDomain = getDomain(websiteUrl(website));
  const emails = [
    ...new Set(
      datasetItems
        .parse(result)
        .flatMap((item) => item.emails.map((email) => email.toLowerCase()))
        .filter((email) => isFirmMailbox(email, firmDomain)),
    ),
  ];
  return emails.length > 0 ? { outcome: 'found' as const, emails } : { outcome: 'not_found' as const, emails };
}

export const emailLookup = defineStep({
  type: 'email_lookup',
  runOnce: false,
  configSchema: NODE_CONFIG_SCHEMAS.email_lookup,
  inputSchema: z.object({}),
  outputSchema: z.object({
    outcome: z.enum(['found', 'not_found']),
    emails: z.array(z.string()),
  }),
  async run({ context, config }) {
    const admin = getSupabaseServerAdminClient();
    const lookupId = uuidFromKey(`workflow_step:${context.idempotencyKey}`);
    const firm = await teamRow(config.firmId, 'That firm is not on this team', (id) =>
      getSupabaseServerAdminClient()
        .from('firm')
        .select('website')
        .eq('id', id)
        .eq('account_id', context.accountId)
        .maybeSingle()
        .throwOnError(),
    );
    if (!firm.website) {
      throw ApplicationFailure.nonRetryable('This firm has no website to look up');
    }

    const { data: recorded } = await admin
      .from('paid_lookup')
      .select('outcome, result')
      .eq('id', lookupId)
      .neq('outcome', 'failed')
      .maybeSingle()
      .throwOnError();
    if (recorded) {
      return lookupOutcome(recorded.result, firm.website);
    }

    const credentials = await providerKey(context.accountId, 'email_lookup');
    if (!credentials) {
      throw ApplicationFailure.nonRetryable('Connect an email lookup provider first');
    }

    await reserveLookup({
      id: lookupId,
      accountId: context.accountId,
      firmId: config.firmId,
      provider: credentials.provider,
    });

    const actorResponse = await pinnedPost(
      `${credentials.baseUrl}/acts/${credentials.actorId.replace('/', '~')}/run-sync-get-dataset-items`,
      { authorization: `Bearer ${credentials.apiKey}` },
      { startUrls: [{ url: websiteUrl(firm.website) }] },
      { timeoutMs: APIFY_RUN_TIMEOUT_MS, signal: context.signal },
    );
    const datasetBody = parsedJson(actorResponse.text) as Json | undefined;
    const failedResult =
      datasetBody === undefined
        ? { status: actorResponse.status, text: actorResponse.text }
        : { status: actorResponse.status, body: datasetBody };

    if (actorResponse.status >= 300) {
      await recordLookup(lookupId, { outcome: 'failed', result: failedResult });
      const message = `The email lookup provider answered ${actorResponse.status}`;
      throw actorResponse.status >= 500 ? new Error(message) : ApplicationFailure.nonRetryable(message);
    }
    if (datasetBody === undefined) {
      await recordLookup(lookupId, { outcome: 'failed', result: failedResult });
      throw ApplicationFailure.nonRetryable('The email lookup provider answered with something that is not JSON');
    }

    const lookedUp = lookupOutcome(datasetBody, firm.website);
    if (lookedUp.outcome === 'found') {
      await admin
        .from('firm_email')
        .upsert(
          lookedUp.emails.map((email) => ({
            account_id: context.accountId,
            firm_id: config.firmId,
            email,
            provider: credentials.provider,
          })),
          { onConflict: 'firm_id,email', ignoreDuplicates: true },
        )
        .throwOnError();
      const { data: contacts } = await admin
        .from('contact')
        .select('email')
        .eq('firm_id', config.firmId)
        .not('email', 'is', null)
        .throwOnError();
      const known = new Set(contacts.map((contact) => contact.email!.toLowerCase()));
      const newEmails = lookedUp.emails.filter((email) => !known.has(email));
      if (newEmails.length > 0) {
        await admin
          .from('contact')
          .insert(
            newEmails.map((email) => ({
              account_id: context.accountId,
              firm_id: config.firmId,
              email,
              source: 'email_lookup' as const,
            })),
          )
          .throwOnError();
      }
    }
    await recordLookup(lookupId, { outcome: lookedUp.outcome, result: datasetBody });
    return lookedUp;
  },
});
