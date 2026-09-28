import { handleBillingWebhook } from '@odb/database-webhooks';

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return new Response('Missing signature', { status: 400 });
  }

  const rawBody = await request.text();

  await handleBillingWebhook(rawBody, signature);

  return new Response('OK', { status: 200 });
}
