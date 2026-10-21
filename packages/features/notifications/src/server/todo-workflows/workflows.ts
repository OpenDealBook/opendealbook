import { workflow } from '@novu/framework';
import { z } from 'zod';

import { renderTodoAssignedEmail } from '@odb/email-templates';

import { TODO_ASSIGNED_WORKFLOW_ID } from '../relay/deal-events';

const payloadSchema = z.object({
  assignerName: z.string(),
  dealName: z.string(),
  title: z.string(),
  path: z.string(),
});

export function buildTodoWorkflows(deps: { siteUrl: string }) {
  return [
    workflow(
      TODO_ASSIGNED_WORKFLOW_ID,
      async ({ step, payload }) => {
        await step.email('email', async () => {
          const email = await renderTodoAssignedEmail({
            productName: 'Open Deal Book',
            assignerName: payload.assignerName,
            dealName: payload.dealName,
            title: payload.title,
            actionLink: `${deps.siteUrl}${payload.path}`,
          });

          return { subject: email.subject, body: email.html };
        });
      },
      { payloadSchema },
    ),
  ];
}
