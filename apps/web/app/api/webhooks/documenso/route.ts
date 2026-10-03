import {
  type DocumensoWebhookPayload,
  handleDocumensoWebhook,
} from '@odb/contracts/esign';
import { enhanceRouteHandler } from '@odb/next/routes';
import { getSupabaseServerAdminClient } from '@odb/supabase/server';

export const POST = enhanceRouteHandler(
  async ({ request }) => {
    const payload = (await request.json()) as DocumensoWebhookPayload;

    await handleDocumensoWebhook(payload, {
      client: getSupabaseServerAdminClient(),
    });

    return new Response('OK', { status: 200 });
  },
  { auth: false },
);
