import { workflow } from '@novu/framework';
import { z } from 'zod';

import {
  renderLenderDocumentsDigestEmail,
  renderLenderNoticeEmail,
} from '@odb/email-templates';

import {
  digestedEventSchema,
  groupVisibleItems,
  type VisibleDocument,
  type VisibleFaqEntry,
} from './digest-content';

export interface LenderWorkflowDeps {
  siteUrl: string;
  digestIntervalMinutes: number | undefined;
  loadRoom(input: { roomId: string }): Promise<{
    name: string;
    dealName: string;
    outsideName: string;
    buyerTeam: string;
    dealId: string;
    teamAccountSlug: string;
  }>;
  loadRequestTitle(input: { roomId: string; askId: string }): Promise<string>;
  loadVisibleDocuments(input: {
    userId: string;
    documentIds: string[];
  }): Promise<VisibleDocument[]>;
  loadVisibleFaqEntries(input: {
    userId: string;
    entryIds: string[];
  }): Promise<VisibleFaqEntry[]>;
}

const PRODUCT_NAME = 'Open Deal Book';

const askPayloadSchema = {
  type: 'object',
  properties: {
    roomId: { type: 'string' },
    askId: { type: 'string' },
    kind: { type: 'string', enum: ['ask', 'form'] },
  },
  required: ['roomId', 'askId', 'kind'],
} as const;

const timelineAnswerPayloadSchema = {
  type: 'object',
  properties: {
    roomId: { type: 'string' },
    answer: { type: 'string', enum: ['yes', 'no', 'need_to_talk'] },
  },
  required: ['roomId', 'answer'],
} as const;

const timelineAnswerWording = {
  yes: 'can close by the date you asked',
  no: 'cannot close by the date you asked',
  need_to_talk: 'wants to talk about the closing date',
} as const;

const signaturePayloadSchema = {
  type: 'object',
  properties: {
    roomId: { type: 'string' },
    askId: { type: 'string' },
    audience: { type: 'string', enum: ['lender', 'team'] },
  },
  required: ['roomId', 'askId', 'audience'],
} as const;

const accessRequestPayloadSchema = {
  type: 'object',
  properties: {
    roomId: { type: 'string' },
    email: { type: 'string' },
  },
  required: ['roomId', 'email'],
} as const;

const documentLookupSchema = {
  type: 'object',
  properties: {
    checked: { type: 'boolean' },
    rooms: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          roomId: { type: 'string' },
          name: { type: 'string' },
          items: {
            type: 'array',
            items: {
              anyOf: [
                {
                  type: 'object',
                  properties: {
                    kind: { type: 'string', const: 'document' },
                    name: { type: 'string' },
                    status: { type: 'string', enum: ['new', 'updated'] },
                  },
                  required: ['kind', 'name', 'status'],
                },
                {
                  type: 'object',
                  properties: {
                    kind: { type: 'string', const: 'faq' },
                    question: { type: 'string' },
                  },
                  required: ['kind', 'question'],
                },
              ],
            },
          },
          moreCount: { type: 'number' },
        },
        required: ['roomId', 'name', 'items', 'moreCount'],
      },
    },
  },
  required: ['checked', 'rooms'],
} as const;

const lendersToNudgePayloadSchema = {
  type: 'object',
  properties: {
    accountSlug: { type: 'string' },
    lenders: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          lenderName: { type: 'string' },
          deals: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                dealName: { type: ['string', 'null'] },
                daysSilent: { type: 'number' },
              },
              required: ['dealName', 'daysSilent'],
            },
          },
        },
        required: ['lenderName', 'deals'],
      },
    },
  },
  required: ['accountSlug', 'lenders'],
} as const;

interface AskPayload {
  roomId: string;
  askId: string;
  kind: 'ask' | 'form';
}

interface Notice {
  subject: string;
  message: string;
  actionLabel: string;
  actionLink: string;
}

async function noticeEmail(notice: Notice) {
  const email = await renderLenderNoticeEmail({
    productName: PRODUCT_NAME,
    ...notice,
  });

  return { subject: email.subject, body: email.html };
}

function askWorkflow(
  workflowId: string,
  buildNotice: (payload: AskPayload) => Promise<Notice>,
) {
  return workflow(
    workflowId,
    async ({ step, payload }) => {
      await step.email('email', async () =>
        noticeEmail(await buildNotice(payload)),
      );
    },
    { payloadSchema: askPayloadSchema },
  );
}

export function buildLenderWorkflows(deps: LenderWorkflowDeps) {
  const teamLink = `${deps.siteUrl}/home`;

  const threadPath = ({ askId, kind }: Pick<AskPayload, 'askId' | 'kind'>) =>
    `/requests/${kind === 'ask' ? 'asks' : 'forms'}/${askId}`;

  const lenderRequestLink = (payload: AskPayload) =>
    `${deps.siteUrl}/lender/${payload.roomId}${threadPath(payload)}`;

  const teamRoomLink = (
    roomId: string,
    room: Awaited<ReturnType<LenderWorkflowDeps['loadRoom']>>,
  ) =>
    `${deps.siteUrl}/home/${room.teamAccountSlug}/deals/${room.dealId}/lenders/${roomId}`;

  const teamThread = (payload: AskPayload) => {
    const target = payload.kind === 'ask' ? 'the request' : 'the form';

    return deps
      .loadRoom(payload)
      .then((room) => ({
        target,
        actionLabel: `Open ${target}`,
        actionLink: `${teamRoomLink(payload.roomId, room)}${threadPath(payload)}`,
      }))
      .catch(() => ({
        target: "the deal's lenders page",
        actionLabel: 'Open your deals',
        actionLink: teamLink,
      }));
  };

  const loadRequest = async (payload: { roomId: string; askId: string }) => {
    try {
      const [room, title] = await Promise.all([
        deps.loadRoom(payload),
        deps.loadRequestTitle(payload),
      ]);

      return {
        team: room.buyerTeam,
        outsideName: room.outsideName,
        roomName: room.name,
        teamRoomLink: teamRoomLink(payload.roomId, room),
        title,
      };
    } catch {
      return null;
    }
  };

  const signatureWorkflow = (
    workflowId: string,
    outcome: {
      lenderSubject: string;
      teamSubject: string;
      describe: (form: string, place: string) => string;
      lenderNext: (team: string) => string;
      teamNext: (page: string) => string;
    },
  ) =>
    workflow(
      workflowId,
      async ({ step, payload }) => {
        await step.email('email', async () => {
          const request = await loadRequest(payload);
          const team = request?.team ?? 'The deal team';
          const forLender = payload.audience === 'lender';
          const happened = request
            ? outcome.describe(
                `"${request.title}"`,
                `in the ${request.roomName} lender room`,
              )
            : forLender
              ? outcome.describe('a form you sent', 'in your lender room')
              : outcome.describe('a form', 'in a lender room');

          return noticeEmail(
            forLender
              ? {
                  subject: `${
                    request ? `${team} on ${request.outsideName}` : team
                  }: ${outcome.lenderSubject}`,
                  message: `${happened}${outcome.lenderNext(team)}`,
                  actionLabel: 'View the form',
                  actionLink: lenderRequestLink({ ...payload, kind: 'form' }),
                }
              : {
                  subject: outcome.teamSubject,
                  message: `${happened}${outcome.teamNext(
                    request ? "the form's page" : "the deal's lenders page",
                  )}`,
                  actionLabel: request ? 'Open the form' : 'Open your deals',
                  actionLink: request
                    ? `${request.teamRoomLink}${threadPath({ ...payload, kind: 'form' })}`
                    : teamLink,
                },
          );
        });
      },
      { payloadSchema: signaturePayloadSchema },
    );

  const followUp = (team: string) => ` ${team} will follow up in the thread.`;
  const sendAgain = (page: string) =>
    ` A new signature request can be made from ${page}.`;

  return [
    signatureWorkflow('lender_form.signature_completed', {
      lenderSubject: 'your form has been signed',
      teamSubject: 'A lender form has been signed',
      describe: (form, place) => `The signed copy of ${form} is ${place}.`,
      lenderNext: () => '',
      teamNext: () => '',
    }),

    signatureWorkflow('lender_form.signature_declined', {
      lenderSubject: 'signing was declined',
      teamSubject: 'A lender form signature was declined',
      describe: (form, place) =>
        `The signature request for ${form} ${place} was declined or cancelled.`,
      lenderNext: followUp,
      teamNext: sendAgain,
    }),

    signatureWorkflow('lender_form.signature_expired', {
      lenderSubject: 'signing expired',
      teamSubject: 'A lender form signature expired',
      describe: (form, place) =>
        `The signature request for ${form} ${place} expired before everyone signed.`,
      lenderNext: followUp,
      teamNext: sendAgain,
    }),

    askWorkflow('lender_ask.answered', async (payload) => {
      const request = await loadRequest(payload);
      const team = request?.team ?? 'The deal team';

      return payload.kind === 'ask'
        ? {
            subject: request
              ? `${team} answered your request on ${request.outsideName}`
              : `${team} answered your request`,
            message: `${
              request
                ? `${team} has replied to your request "${request.title}" in the ${request.roomName} lender room.`
                : 'The deal team has replied to a request you made in your lender room.'
            } Open it to read the reply and download any files that came with it.`,
            actionLabel: 'View the request',
            actionLink: lenderRequestLink(payload),
          }
        : {
            subject: request
              ? `${team} replied about your form on ${request.outsideName}`
              : `${team} replied about your form`,
            message: `${
              request
                ? `${team} has replied about your form "${request.title}" in the ${request.roomName} lender room.`
                : 'The deal team has replied about a form you sent through your lender room.'
            } Open it to read the reply.`,
            actionLabel: 'View the form',
            actionLink: lenderRequestLink(payload),
          };
    }),

    askWorkflow('lender_form.returned', async (payload) => {
      const request = await loadRequest(payload);
      const team = request?.team ?? 'The deal team';

      return {
        subject: request
          ? `${team} returned your form on ${request.outsideName}`
          : `${team} returned your form`,
        message: `${
          request
            ? `${team} has completed your form "${request.title}" in the ${request.roomName} lender room.`
            : 'The deal team has completed a form you sent through your lender room.'
        } Open it to download the completed copy.`,
        actionLabel: 'View the form',
        actionLink: lenderRequestLink(payload),
      };
    }),

    askWorkflow('lender_ask.opened', async (payload) => {
      const { target, ...action } = await teamThread(payload);

      return {
        subject: 'A lender made a new request',
        message: `A lender made a new request in their lender room. Open ${target} to read it and reply.`,
        ...action,
      };
    }),

    askWorkflow('lender_ask.replied', async (payload) => {
      const { target, ...action } = await teamThread(payload);

      return {
        subject:
          payload.kind === 'ask'
            ? 'A lender replied to a request'
            : 'A lender replied about a form',
        message: `A lender added a reply in their lender room. Open ${target} to read it and respond.`,
        ...action,
      };
    }),

    askWorkflow('lender_form.uploaded', async (payload) => {
      const { target, ...action } = await teamThread(payload);

      return {
        subject: 'A lender uploaded a form to complete',
        message: `A lender uploaded a form for your team to complete and return. Open ${target} to see it.`,
        ...action,
      };
    }),

    workflow(
      'lender_room.timeline_answered',
      async ({ step, payload }) => {
        await step.email('email', async () => {
          const room = await deps.loadRoom(payload).catch(() => null);

          return noticeEmail({
            subject: 'A lender answered your closing timeline question',
            message: `${room ? room.name : 'A lender'} ${
              timelineAnswerWording[payload.answer]
            }. Open ${room ? 'the lender room' : "the deal's lenders page"} to follow up.`,
            actionLabel: room ? 'Open the lender room' : 'Open your deals',
            actionLink: room ? teamRoomLink(payload.roomId, room) : teamLink,
          });
        });
      },
      { payloadSchema: timelineAnswerPayloadSchema },
    ),

    workflow(
      'lender_room.access_requested',
      async ({ step, payload }) => {
        await step.email('email', async () => {
          const room = await deps.loadRoom(payload).catch(() => null);

          return noticeEmail({
            subject: room
              ? `${payload.email} asked for access to ${room.name}`
              : 'Someone asked for access to a closed lender room',
            message: `${payload.email} asked for access to ${
              room
                ? `the ${room.name} lender room on ${room.dealName}, which is closed or expired.`
                : 'a lender room that is closed or expired.'
            } Reopen the room from ${
              room ? 'its settings' : "the deal's lenders page"
            } to let them back in.`,
            actionLabel: room ? 'Open the lender room' : 'Open your deals',
            actionLink: room ? teamRoomLink(payload.roomId, room) : teamLink,
          });
        });
      },
      { payloadSchema: accessRequestPayloadSchema },
    ),

    workflow(
      'lender-nudges.daily',
      async ({ step, payload }) => {
        await step.email('email', async () => {
          const count = payload.lenders.length;

          return noticeEmail({
            subject: `${count} ${count === 1 ? 'lender' : 'lenders'} to nudge today`,
            message: payload.lenders
              .map(
                (lender) =>
                  `${lender.lenderName}: ${lender.deals
                    .map(
                      (deal) =>
                        `${deal.dealName ?? 'your deal'}, quiet ${deal.daysSilent} days`,
                    )
                    .join('; ')}.`,
              )
              .join(' '),
            actionLabel: 'Open your lenders',
            actionLink: `${deps.siteUrl}/home/${payload.accountSlug}/lenders`,
          });
        });
      },
      { payloadSchema: lendersToNudgePayloadSchema },
    ),

    workflow('lender-room-documents', async ({ step, subscriber }) => {
      const digest = await step.digest('daily-digest', () =>
        deps.digestIntervalMinutes === undefined
          ? { type: 'timed' as const, cron: '0 22 * * *' }
          : { amount: deps.digestIntervalMinutes, unit: 'minutes' as const },
      );

      const lookup = await step.custom(
        'visible-documents',
        async () => {
          const userId = z.string().parse(subscriber.subscriberId);
          const digested = digest.events.map((event) =>
            digestedEventSchema.parse(event.payload),
          );

          try {
            const [documents, faqEntries] = await Promise.all([
              deps.loadVisibleDocuments({
                userId,
                documentIds: digested.flatMap((event) =>
                  'documentId' in event ? [event.documentId] : [],
                ),
              }),
              deps.loadVisibleFaqEntries({
                userId,
                entryIds: digested.flatMap((event) =>
                  'entryId' in event ? [event.entryId] : [],
                ),
              }),
            ]);

            return {
              checked: true,
              rooms: groupVisibleItems(digested, documents, faqEntries),
            };
          } catch {
            return { checked: false, rooms: [] };
          }
        },
        { outputSchema: documentLookupSchema },
      );

      await step.email(
        'email',
        async () => {
          if (!lookup.checked) {
            return noticeEmail({
              subject: 'New or updated documents in your lender room',
              message:
                'Documents were added or updated in your lender room. Open it to see what changed.',
              actionLabel: 'Open your lender rooms',
              actionLink: `${deps.siteUrl}/lender`,
            });
          }

          const email = await renderLenderDocumentsDigestEmail({
            productName: PRODUCT_NAME,
            rooms: lookup.rooms.map(({ roomId, ...room }) => ({
              ...room,
              link: `${deps.siteUrl}/lender/${roomId}`,
              faqLink: `${deps.siteUrl}/lender/${roomId}/faq`,
            })),
          });

          return { subject: email.subject, body: email.html };
        },
        { skip: () => lookup.checked && lookup.rooms.length === 0 },
      );
    }),
  ];
}
