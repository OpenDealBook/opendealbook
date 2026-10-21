import { workflow } from '@novu/framework';

import { renderLenderNoticeEmail } from '@odb/email-templates';

const EVENT_LABELS = {
  'deal.offer_submitted': 'Offer submitted',
  'deal.offer_accepted': 'Offer accepted',
  'deal.loi_accepted': 'LOI accepted',
  'deal.apa_accepted': 'APA accepted',
} as const;

const RESOLVED_WORKFLOW_ID = 'deal.resolved';

const payloadSchema = {
  type: 'object',
  properties: {
    dealId: { type: 'string' },
    path: { type: 'string' },
    firmName: { type: ['string', 'null'] },
    outcome: { type: 'string', enum: ['closed', 'lost'] },
  },
  required: ['dealId', 'path', 'firmName'],
} as const;

export function buildDealEventWorkflows(deps: { siteUrl: string }) {
  const notice = (
    workflowId: string,
    line: (name: string, outcome: 'closed' | 'lost' | undefined) => string,
  ) =>
    workflow(
      workflowId,
      async ({ step, payload }) => {
        await step.email('email', async () => {
          const message = line(
            payload.firmName ?? 'your deal',
            payload.outcome,
          );
          const email = await renderLenderNoticeEmail({
            productName: 'Open Deal Book',
            subject: message,
            message,
            actionLabel: 'Open the deal',
            actionLink: `${deps.siteUrl}${payload.path}`,
          });

          return { subject: email.subject, body: email.html };
        });
      },
      { payloadSchema },
    );

  return [
    ...Object.entries(EVENT_LABELS).map(([workflowId, label]) =>
      notice(workflowId, (name) => `${label} on ${name}`),
    ),
    notice(RESOLVED_WORKFLOW_ID, (name, outcome) =>
      outcome === 'lost' ? `${name} was marked lost` : `${name} closed`,
    ),
  ];
}
