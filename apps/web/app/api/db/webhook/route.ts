import { handleDatabaseWebhook } from '@odb/database-webhooks';
import { enhanceRouteHandler } from '@odb/next/routes';

export const POST = enhanceRouteHandler(
  async ({ request }) => {
    await handleDatabaseWebhook(request);

    return new Response('OK', { status: 200 });
  },
  { auth: false },
);
