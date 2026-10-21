import { STAND_INS, STRIPE_WEBHOOK_SECRET, WEB_URL } from '../fixtures/stack';
import { gmailStandIn } from './gmail';
import { serve } from './http';
import { llmStandIn } from './llm';
import { nangoStandIn } from './nango';
import { stripeStandIn } from './stripe';

export async function startStandIns(): Promise<() => Promise<void>> {
  const servers = await Promise.all([
    serve(STAND_INS.llm, llmStandIn()),
    serve(STAND_INS.nango, nangoStandIn()),
    serve(STAND_INS.gmail, gmailStandIn()),
    serve(
      STAND_INS.stripe,
      stripeStandIn({
        url: STAND_INS.stripe,
        webhookUrl: `${WEB_URL}/api/billing/webhook`,
        webhookSecret: STRIPE_WEBHOOK_SECRET,
      }),
    ),
  ]);

  return async () => {
    await Promise.all(
      servers.map((server) => new Promise((resolve) => server.close(resolve))),
    );
  };
}
