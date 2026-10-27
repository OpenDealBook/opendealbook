import { workflow } from '@novu/framework';
import { z } from 'zod';

import { renderLenderNoticeEmail } from '@odb/email-templates';

import {
  APPROVAL_WAITING_EVENT,
  DILIGENCE_RED_FINDING_EVENT,
  RUN_FAILED_NOTICE_EVENT,
  RUN_PAUSED_NOTICE_EVENT,
} from './events';

const payloadSchema = z.object({ message: z.string(), path: z.string() });

export function buildWorkflowRunWorkflows(deps: { siteUrl: string }) {
  const runNotice = (event: string, actionLabel = 'Open the run') =>
    workflow(
      event,
      async ({ step, payload }) => {
        await step.email('email', async () => {
          const email = await renderLenderNoticeEmail({
            productName: 'Open Deal Book',
            subject: payload.message,
            message: payload.message,
            actionLabel,
            actionLink: `${deps.siteUrl}${payload.path}`,
          });

          return { subject: email.subject, body: email.html };
        });
      },
      { payloadSchema },
    );

  return [
    runNotice(RUN_FAILED_NOTICE_EVENT),
    runNotice(RUN_PAUSED_NOTICE_EVENT),
    runNotice(APPROVAL_WAITING_EVENT, 'Open approvals'),
    runNotice(DILIGENCE_RED_FINDING_EVENT, 'Open background findings'),
  ];
}
