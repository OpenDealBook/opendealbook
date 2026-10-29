import { workflow } from '@novu/framework';
import { z } from 'zod';

import { renderDealDeletedEmail } from '@odb/email-templates';

import { DEAL_DELETED_WORKFLOW_ID } from '../relay/deal-events';

const payloadSchema = z.object({ teamName: z.string(), dealName: z.string() });

export function buildDealDeletedWorkflows() {
  return [
    workflow(
      DEAL_DELETED_WORKFLOW_ID,
      async ({ step, payload }) => {
        await step.email('email', async () => {
          const email = await renderDealDeletedEmail({
            productName: 'Open Deal Book',
            teamName: payload.teamName,
            dealName: payload.dealName,
          });

          return { subject: email.subject, body: email.html };
        });
      },
      { payloadSchema },
    ),
  ];
}
