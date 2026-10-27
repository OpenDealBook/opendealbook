import { ApplicationFailure } from '@temporalio/common';
import { getDomain } from 'tldts';
import { z } from 'zod';

import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { uuidFromKey } from '../../uuidFromKey';
import { NODE_CONFIG_SCHEMAS } from '../graph';
import { paidApifyRun, recordedResult } from '../paidApifyRun';
import { providerKey } from '../providerKeys';
import { defineStep } from '../step';
import { teamRow } from '../teamRow';

const datasetItems = z.array(z.object({ emails: z.array(z.string()) }).loose());

const MACHINE_MAILBOXES = new Set(['noreply', 'no-reply', 'postmaster']);

function websiteUrl(website: string): string {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(website) ? website : `https://${website}`;
}

function isFirmMailbox(email: string, firmDomain: string | null): boolean {
  const [mailbox, host] = email.split('@');
  return !MACHINE_MAILBOXES.has(mailbox!) && host !== undefined && getDomain(host) === firmDomain;
}

function firmEmails(website: string) {
  const firmDomain = getDomain(websiteUrl(website));
  return datasetItems.transform((items) => {
    const emails = [
      ...new Set(
        items
          .flatMap((item) => item.emails.map((email) => email.toLowerCase()))
          .filter((email) => isFirmMailbox(email, firmDomain)),
      ),
    ];
    return emails.length > 0 ? { outcome: 'found' as const, emails } : { outcome: 'not_found' as const, emails };
  });
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

    const recorded = await recordedResult(lookupId, firmEmails(firm.website));
    if (recorded !== null) {
      return recorded;
    }
    const credentials = await providerKey(context.accountId, 'email_lookup');
    if (!credentials) {
      throw ApplicationFailure.nonRetryable('Connect an email lookup provider first');
    }

    return paidApifyRun(
      { accountId: context.accountId, firmId: config.firmId, credentials, signal: context.signal },
      {
        lookupId,
        actor: { id: credentials.actorId, provider: 'email lookup' },
        input: { startUrls: [{ url: websiteUrl(firm.website) }] },
        result: firmEmails(firm.website),
        found: (lookedUp) => lookedUp.outcome === 'found',
        beforeRecord: async (lookedUp) => {
          if (lookedUp.outcome === 'not_found') {
            return;
          }
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
        },
      },
    );
  },
});
