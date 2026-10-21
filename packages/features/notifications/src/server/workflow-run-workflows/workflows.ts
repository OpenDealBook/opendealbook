import { workflow } from '@novu/framework';
import { z } from 'zod';

import { renderLenderNoticeEmail } from '@odb/email-templates';

import { RUN_FAILED_NOTICE_EVENT } from './events';

const payloadSchema = z.object({ message: z.string(), path: z.string() });

export function buildWorkflowRunWorkflows(deps: { siteUrl: string }) {
  return [
    workflow(
      RUN_FAILED_NOTICE_EVENT,
      async ({ step, payload }) => {
        await step.email('email', async () => {
          const email = await renderLenderNoticeEmail({
            productName: 'Open Deal Book',
            subject: payload.message,
            message: payload.message,
            actionLabel: 'Open the run',
            actionLink: `${deps.siteUrl}${payload.path}`,
          });

          return { subject: email.subject, body: email.html };
        });
      },
      { payloadSchema },
    ),
  ];
}
