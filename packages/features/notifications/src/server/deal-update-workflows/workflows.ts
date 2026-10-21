import { workflow } from '@novu/framework';

import { renderLenderNoticeEmail } from '@odb/email-templates';

import {
  DEAL_UPDATE_SUBMITTED_WORKFLOW_ID,
  teamItemPath,
} from '../relay/deal-events';

export interface DealUpdateWorkflowDeps {
  siteUrl: string;
  loadSubmittedDealUpdate(input: { updateId: string }): Promise<{
    subject: string;
    authorName: string;
    dealName: string;
    dealId: string;
    teamAccountSlug: string;
  }>;
}

const payloadSchema = {
  type: 'object',
  properties: { updateId: { type: 'string' } },
  required: ['updateId'],
} as const;

export function buildDealUpdateWorkflows(deps: DealUpdateWorkflowDeps) {
  return [
    workflow(
      DEAL_UPDATE_SUBMITTED_WORKFLOW_ID,
      async ({ step, payload }) => {
        await step.email('email', async () => {
          const update = await deps.loadSubmittedDealUpdate({
            updateId: payload.updateId,
          });
          const line = `${update.authorName} submitted an update on ${update.dealName} for approval: ${update.subject}`;
          const email = await renderLenderNoticeEmail({
            productName: 'Open Deal Book',
            subject: line,
            message: line,
            actionLabel: 'Open the deal',
            actionLink: `${deps.siteUrl}${teamItemPath(update.teamAccountSlug, update.dealId, { kind: 'deal-update', id: payload.updateId })}`,
          });

          return { subject: email.subject, body: email.html };
        });
      },
      { payloadSchema },
    ),
  ];
}
