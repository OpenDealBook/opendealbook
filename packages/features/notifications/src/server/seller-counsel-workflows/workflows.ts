import { workflow } from '@novu/framework';

import {
  renderSellerCounselFolderFileEmail,
  renderSellerCounselMessageEmail,
} from '@odb/email-templates';

import {
  counselItemPath,
  SELLER_COUNSEL_FOLDER_WORKFLOW_ID,
  SELLER_COUNSEL_MESSAGE_WORKFLOW_ID,
  sellerItemPath,
} from '../relay/deal-events';

export interface SellerCounselWorkflowDeps {
  siteUrl: string;
}

const payloadSchema = {
  type: 'object',
  properties: {
    audience: { type: 'string', enum: ['seller', 'counsel'] },
    dealId: { type: 'string' },
    roomId: { type: 'string' },
    uploaderName: { type: 'string' },
    fileName: { type: 'string' },
    fileCount: { type: 'number' },
    businessName: { type: 'string' },
  },
  required: [
    'audience',
    'dealId',
    'roomId',
    'uploaderName',
    'fileName',
    'fileCount',
    'businessName',
  ],
} as const;

const messagePayloadSchema = {
  type: 'object',
  properties: {
    audience: { type: 'string', enum: ['seller', 'counsel'] },
    dealId: { type: 'string' },
    roomId: { type: 'string' },
    authorName: { type: 'string' },
    messageId: { type: 'string' },
    businessName: { type: 'string' },
    outsideName: { type: 'string' },
  },
  required: [
    'audience',
    'dealId',
    'roomId',
    'authorName',
    'messageId',
    'businessName',
    'outsideName',
  ],
} as const;

export function buildSellerCounselWorkflows(deps: SellerCounselWorkflowDeps) {
  return [
    workflow(
      SELLER_COUNSEL_FOLDER_WORKFLOW_ID,
      async ({ step, payload }) => {
        await step.email('email', async () => {
          const path =
            payload.audience === 'seller'
              ? `/seller/rooms/${payload.roomId}`
              : `/counsel/${payload.dealId}/seller-room`;
          const email = await renderSellerCounselFolderFileEmail({
            productName: 'Open Deal Book',
            uploaderName: payload.uploaderName,
            fileName: payload.fileName,
            fileCount: payload.fileCount,
            businessName: payload.businessName,
            actionLink: `${deps.siteUrl}${path}`,
          });

          return { subject: email.subject, body: email.html };
        });
      },
      { payloadSchema },
    ),
    workflow(
      SELLER_COUNSEL_MESSAGE_WORKFLOW_ID,
      async ({ step, payload }) => {
        await step.email('email', async () => {
          const message = {
            kind: 'seller-counsel-message' as const,
            id: payload.messageId,
          };
          const path =
            payload.audience === 'seller'
              ? sellerItemPath(payload.roomId, message)
              : counselItemPath(payload.dealId, message);
          const email = await renderSellerCounselMessageEmail({
            productName: 'Open Deal Book',
            authorName: payload.authorName,
            businessName: payload.businessName,
            subjectDealName: payload.outsideName,
            actionLink: `${deps.siteUrl}${path}`,
          });

          return { subject: email.subject, body: email.html };
        });
      },
      { payloadSchema: messagePayloadSchema },
    ),
  ];
}
