import * as z from 'zod';

import { getLogger } from '@odb/shared/logger';
import { getSupabaseServerAdminClient } from '@odb/supabase/server';

import type { AnyRecordChange } from './record-change';

import { timingSafeEqual } from 'node:crypto';

type AdminClient = ReturnType<typeof getSupabaseServerAdminClient>;

const signatureHeader = 'X-Supabase-Event-Signature';

export async function handleDatabaseWebhook(request: Request): Promise<void> {
  verifySignatureOrThrow(request.headers.get(signatureHeader));

  const change = (await request.json()) as AnyRecordChange;

  getLogger().info(
    { table: change.table, type: change.type },
    'Processing database webhook',
  );

  await route(getSupabaseServerAdminClient(), change);
}

function verifySignatureOrThrow(signature: string | null): void {
  const secret = z
    .string()
    .min(1)
    .parse(process.env.SUPABASE_DB_WEBHOOK_SECRET);

  if (signature === null || !constantTimeEqual(signature, secret)) {
    throw new Error('Invalid database webhook signature');
  }
}

async function route(
  client: AdminClient,
  change: AnyRecordChange,
): Promise<void> {
  if (
    change.table === 'accounts' &&
    change.type === 'DELETE' &&
    change.old_record
  ) {
    await deleteBillingCustomers(client, change.old_record.id);
  }
}

async function deleteBillingCustomers(
  client: AdminClient,
  accountId: string,
): Promise<void> {
  await client.from('billing_customers').delete().eq('account_id', accountId);
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
