import { handleDatabaseWebhook } from '@tuckin/database-webhooks';
import { enhanceRouteHandler } from '@tuckin/next/routes';

export const POST = enhanceRouteHandler(
  async ({ request }) => {
    await handleDatabaseWebhook(request);

    return new Response('OK', { status: 200 });
  },
  { auth: false },
);
