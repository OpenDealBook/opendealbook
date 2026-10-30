import { workflow } from '@novu/framework';
import { z } from 'zod';

import {
  renderContractReviewReminderEmail,
  renderContractReviewUnansweredEmail,
  renderLenderNoticeEmail,
  renderSellerActivityDigestEmail,
} from '@odb/email-templates';

import {
  CONTRACT_NEGOTIATION_WORKFLOW_ID,
  COUNSEL_MESSAGE_WORKFLOW_ID,
  COUNSEL_UPLOADS_WORKFLOW_ID,
  counselItemPath,
  teamItemPath,
} from '../relay/deal-events';

export interface ManagedCounselDeal {
  dealId: string;
  title: string;
  path: string;
}

export interface CounselWorkflowDeps {
  siteUrl: string;
  digestIntervalMinutes: number | undefined;
  loadManagedCounselDeals(input: {
    userId: string;
    dealIds: string[];
  }): Promise<ManagedCounselDeal[]>;
  loadCounselMessage(input: {
    messageId: string;
    audience: 'team' | 'counsel';
  }): Promise<{
    dealId: string;
    dealName: string;
    outsideName: string;
    teamAccountSlug: string;
    side: 'buyer' | 'seller';
    authorName: string | null;
  }>;
}

const SIDE_LABEL = { buyer: "buyer's counsel", seller: "seller's counsel" };
const COUNSEL_LABEL = { buyer: "Buyer's counsel", seller: "Seller's counsel" };

const payloadSchema = {
  type: 'object',
  properties: {
    messageId: { type: 'string' },
    audience: { type: 'string', enum: ['team', 'counsel'] },
  },
  required: ['messageId', 'audience'],
} as const;

const uploadsPayloadSchema = {
  type: 'object',
  properties: {
    dealId: { type: 'string' },
    line: { type: 'string' },
  },
  required: ['dealId', 'line'],
} as const;

const uploadSchema = z.object({ dealId: z.string(), line: z.string() });

const negotiationPayloadSchema = {
  type: 'object',
  properties: {
    kind: {
      type: 'string',
      enum: [
        'version',
        'comment',
        'review_requested',
        'review_decided',
        'signing_overridden',
      ],
    },
    verdict: {
      type: 'string',
      enum: ['approved', 'approved_with_comments', 'changes_needed'],
    },
    reason: { type: 'string' },
    outForSignature: { type: 'boolean' },
    contractType: { type: 'string', enum: ['loi', 'apa', 'loi_extension'] },
    version: { type: 'number' },
    actor: { type: 'string' },
    dealName: { type: 'string' },
    outsideName: { type: 'string' },
    path: { type: 'string' },
  },
  required: ['kind', 'contractType', 'version', 'actor', 'dealName', 'path'],
} as const;

const reviewPayloadProperties = {
  dealName: { type: ['string', 'null'] },
  contractType: { type: 'string', enum: ['loi', 'apa', 'loi_extension'] },
  version: { type: 'number' },
  since: { type: 'string' },
  path: { type: 'string' },
} as const;

const reviewPayloadRequired = [
  'dealName',
  'contractType',
  'version',
  'since',
  'path',
] as const;

const reviewReminderPayloadSchema = {
  type: 'object',
  properties: {
    ...reviewPayloadProperties,
    subjectDealName: { type: 'string' },
  },
  required: [...reviewPayloadRequired, 'subjectDealName'],
} as const;

const reviewUnansweredPayloadSchema = {
  type: 'object',
  properties: {
    ...reviewPayloadProperties,
    side: { type: 'string', enum: ['buyer', 'seller'] },
  },
  required: [...reviewPayloadRequired, 'side'],
} as const;

const CONTRACT_LABEL = {
  loi: 'LOI',
  apa: 'APA',
  loi_extension: 'LOI extension',
};

const NEGOTIATION_VERB = {
  version: 'added',
  comment: 'commented on',
  review_requested: 'asked for a review of',
  signing_overridden: 'overrode counsel sign-off on',
};

const VERDICT_VERB = {
  approved: 'approved',
  approved_with_comments: 'approved with comments',
  changes_needed: 'asked for changes to',
};

const dealsOutputSchema = {
  type: 'object',
  properties: {
    deals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          link: { type: 'string' },
          lines: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'link', 'lines'],
      },
    },
  },
  required: ['deals'],
} as const;

export function buildCounselWorkflows(deps: CounselWorkflowDeps) {
  return [
    workflow(
      COUNSEL_UPLOADS_WORKFLOW_ID,
      async ({ step, subscriber }) => {
        const digest = await step.digest('daily-digest', () =>
          deps.digestIntervalMinutes === undefined
            ? { type: 'timed' as const, cron: '0 22 * * *' }
            : { amount: deps.digestIntervalMinutes, unit: 'minutes' as const },
        );

        const managed = await step.custom(
          'managed-deals',
          async () => {
            const uploads = digest.events.map((event) =>
              uploadSchema.parse(event.payload),
            );
            const deals = await deps.loadManagedCounselDeals({
              userId: z.string().parse(subscriber.subscriberId),
              dealIds: [...new Set(uploads.map((upload) => upload.dealId))],
            });

            return {
              deals: deals.map((deal) => ({
                title: deal.title,
                link: `${deps.siteUrl}${deal.path}`,
                lines: uploads
                  .filter((upload) => upload.dealId === deal.dealId)
                  .map((upload) => upload.line),
              })),
            };
          },
          { outputSchema: dealsOutputSchema },
        );

        await step.email(
          'email',
          async () => {
            const email = await renderSellerActivityDigestEmail({
              productName: 'Open Deal Book',
              subject: "Buyer's counsel uploaded files today",
              heading: "Buyer's counsel uploaded files today",
              rooms: managed.deals,
            });

            return { subject: email.subject, body: email.html };
          },
          { skip: () => managed.deals.length === 0 },
        );
      },
      { payloadSchema: uploadsPayloadSchema },
    ),
    workflow(
      COUNSEL_MESSAGE_WORKFLOW_ID,
      async ({ step, payload }) => {
        await step.email('email', async () => {
          const message = await deps.loadCounselMessage(payload);
          const deal = message.dealName;
          const item = {
            kind: 'counsel-message' as const,
            id: payload.messageId,
          };
          const notice =
            payload.audience === 'team'
              ? {
                  subject: `New message from ${SIDE_LABEL[message.side]}`,
                  message: `${message.authorName ?? 'Counsel'} (${SIDE_LABEL[message.side]}) sent the deal team a message on ${deal}.`,
                  actionLabel: 'Open the deal',
                  actionLink: `${deps.siteUrl}${teamItemPath(message.teamAccountSlug, message.dealId, item)}`,
                }
              : {
                  subject: `New message from the deal team on ${message.outsideName}`,
                  message: `The deal team sent you a message on ${deal}.`,
                  actionLabel: 'Open your messages',
                  actionLink: `${deps.siteUrl}${counselItemPath(message.dealId, item)}`,
                };
          const email = await renderLenderNoticeEmail({
            productName: 'Open Deal Book',
            ...notice,
          });

          return { subject: email.subject, body: email.html };
        });
      },
      { payloadSchema },
    ),
    workflow(
      CONTRACT_NEGOTIATION_WORKFLOW_ID,
      async ({ step, payload }) => {
        await step.email('email', async () => {
          const contract = CONTRACT_LABEL[payload.contractType];
          const verb =
            payload.kind === 'review_decided'
              ? VERDICT_VERB[payload.verdict!]
              : NEGOTIATION_VERB[payload.kind];
          const ending =
            payload.kind === 'signing_overridden'
              ? `: ${payload.reason}`
              : payload.outForSignature
                ? '. It is already out for signature and was not recalled.'
                : '.';
          const email = await renderLenderNoticeEmail({
            productName: 'Open Deal Book',
            subject: `${payload.actor} ${verb} ${contract} version ${payload.version}${
              payload.outsideName ? ` on ${payload.outsideName}` : ''
            }`,
            message: `${payload.actor} ${verb} version ${payload.version} of the ${contract} on ${payload.dealName}${ending}`,
            actionLabel: 'Open the contract',
            actionLink: `${deps.siteUrl}${payload.path}`,
          });

          return { subject: email.subject, body: email.html };
        });
      },
      { payloadSchema: negotiationPayloadSchema },
    ),
    workflow(
      'contract-review.reminder',
      async ({ step, payload }) => {
        await step.email('email', async () => {
          const email = await renderContractReviewReminderEmail({
            productName: 'Open Deal Book',
            contractLabel: CONTRACT_LABEL[payload.contractType],
            version: payload.version,
            dealName: payload.dealName ?? 'your deal',
            subjectDealName: payload.subjectDealName,
            since: payload.since,
            actionLink: `${deps.siteUrl}${payload.path}`,
          });

          return { subject: email.subject, body: email.html };
        });
      },
      { payloadSchema: reviewReminderPayloadSchema },
    ),
    workflow(
      'contract-review.unanswered',
      async ({ step, payload }) => {
        await step.email('email', async () => {
          const email = await renderContractReviewUnansweredEmail({
            productName: 'Open Deal Book',
            counselLabel: COUNSEL_LABEL[payload.side],
            contractLabel: CONTRACT_LABEL[payload.contractType],
            version: payload.version,
            dealName: payload.dealName ?? 'your deal',
            since: payload.since,
            actionLink: `${deps.siteUrl}${payload.path}`,
          });

          return { subject: email.subject, body: email.html };
        });
      },
      { payloadSchema: reviewUnansweredPayloadSchema },
    ),
  ];
}
