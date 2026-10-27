import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import { getSupabaseServerAdminClient } from '@odb/supabase/server';

const FIVE_MINUTES = 5 * 60_000;
const STATUS_ORDER = ['queued', 'created', 'mailed', 'in_transit', 'delivered', 'returned'] as const;

const LETTER_STATUSES: Record<string, (typeof STATUS_ORDER)[number]> = {
  'letter.mailed': 'mailed',
  'letter.in_transit': 'in_transit',
  'letter.in_local_area': 'in_transit',
  'letter.processed_for_delivery': 'in_transit',
  'letter.delivered': 'delivered',
  'letter.returned_to_sender': 'returned',
};

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function signedRecentlyBy(secret: string, request: Request, body: string): boolean {
  const timestamp = request.headers.get('Lob-Signature-Timestamp') ?? '';
  const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return (
    timingSafeEqual(sha256(request.headers.get('Lob-Signature') ?? ''), sha256(expected)) &&
    Date.now() - Number(timestamp) <= FIVE_MINUTES
  );
}

export async function POST(request: Request, context: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await context.params;
  if (!z.uuid().safeParse(accountId).success) {
    return new Response('Not Found', { status: 404 });
  }
  const admin = getSupabaseServerAdminClient();
  const body = await request.text();

  const { data: secret } = await admin
    .rpc('letter_webhook_secret', { p_account_id: accountId })
    .throwOnError();
  if (!secret || !signedRecentlyBy(secret, request, body)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const event = JSON.parse(body) as { event_type: { id: string }; body: { id: string } };
  const status = LETTER_STATUSES[event.event_type.id];
  if (status !== undefined) {
    await admin
      .from('outreach_letter')
      .update({ status })
      .eq('account_id', accountId)
      .eq('provider', 'lob')
      .eq('provider_letter_id', event.body.id)
      .in('status', STATUS_ORDER.slice(0, STATUS_ORDER.indexOf(status)))
      .throwOnError();
  }

  return new Response('OK', { status: 200 });
}
