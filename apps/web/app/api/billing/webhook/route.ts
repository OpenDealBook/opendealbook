import { handleBillingWebhook } from '@odb/database-webhooks';

import { requireBilling } from '../../../../config/billing-gate';

export async function POST(request: Request) {
  requireBilling();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return new Response('Missing signature', { status: 400 });
  }

  const rawBody = await request.text();

  await handleBillingWebhook(rawBody, signature);

  return new Response('OK', { status: 200 });
}
