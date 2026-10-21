import { workflow } from '@novu/framework';
import { z } from 'zod';

import {
  renderLenderNoticeEmail,
  renderSellerActivityDigestEmail,
} from '@odb/email-templates';

import {
  SELLER_ROOM_ACCESS_REQUESTED_WORKFLOW_ID,
  SELLER_ROOM_ACTIVITY_WORKFLOW_ID,
  SELLER_ROOM_CLOSED_WORKFLOW_ID,
  SELLER_ROOM_REOPENED_WORKFLOW_ID,
  SELLER_ROOM_SHARED_WORKFLOW_ID,
} from '../relay/deal-events';

export interface ManagedSellerRoom {
  roomId: string;
  title: string;
  path: string;
}

export interface SellerDigestItem {
  kind: 'document' | 'folder' | 'meeting';
  itemId: string;
  name: string;
  folderId: string | null;
  roomId: string;
  teamName: string;
  dealName: string;
  outsideName: string;
}

export interface SellerWorkflowDeps {
  siteUrl: string;
  digestIntervalMinutes: number | undefined;
  loadSellerDigestItems(input: {
    userId: string;
    documentIds: string[];
    folderIds: string[];
    meetingIds: string[];
  }): Promise<SellerDigestItem[]>;
  loadManagedSellerRooms(input: {
    userId: string;
    roomIds: string[];
  }): Promise<ManagedSellerRoom[]>;
}

const sharedEventSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('document'),
    roomId: z.string(),
    documentId: z.string(),
    isNewVersion: z.boolean(),
  }),
  z.object({
    kind: z.literal('folder'),
    roomId: z.string(),
    folderId: z.string(),
  }),
  z.object({
    kind: z.literal('meeting'),
    roomId: z.string(),
    meetingId: z.string(),
  }),
]);

type SharedEvent = z.infer<typeof sharedEventSchema>;

const sharedPayloadSchema = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['document', 'folder', 'meeting'] },
    roomId: { type: 'string' },
    timezone: { type: 'string' },
  },
  required: ['kind', 'roomId'],
} as const;

function itemIdOf(event: SharedEvent): string {
  switch (event.kind) {
    case 'document':
      return event.documentId;
    case 'folder':
      return event.folderId;
    case 'meeting':
      return event.meetingId;
  }
}

function lineFor(event: SharedEvent, name: string, isNew: boolean): string {
  switch (event.kind) {
    case 'document':
      return `${isNew ? 'New file' : 'Updated file'}: ${name}`;
    case 'folder':
      return `New folder: ${name}`;
    case 'meeting':
      return `New meeting: ${name}`;
  }
}

const EVENING_MINUTE = 22 * 60;
const MINUTES_PER_DAY = 24 * 60;

function minutesAheadOfUtc(timezone: string, at: Date): number {
  const offset = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'longOffset',
  })
    .formatToParts(at)
    .find((part) => part.type === 'timeZoneName')!.value;
  const [, sign, hours, minutes] = /^GMT(?:([+-])(\d{2}):(\d{2}))?$/.exec(
    offset,
  )!;

  return sign
    ? (sign === '-' ? -1 : 1) * (Number(hours) * 60 + Number(minutes))
    : 0;
}

function eveningCron(timezone: string | undefined): string {
  const ahead = timezone ? minutesAheadOfUtc(timezone, new Date()) : 0;
  const utcMinute =
    (EVENING_MINUTE - ahead + MINUTES_PER_DAY) % MINUTES_PER_DAY;

  return `${utcMinute % 60} ${Math.floor(utcMinute / 60)} * * *`;
}

function digestWindow(deps: SellerWorkflowDeps, timezone?: string) {
  return deps.digestIntervalMinutes === undefined
    ? { type: 'timed' as const, cron: eveningCron(timezone) }
    : { amount: deps.digestIntervalMinutes, unit: 'minutes' as const };
}

const activityPayloadSchema = {
  type: 'object',
  properties: {
    roomId: { type: 'string' },
    line: { type: 'string' },
  },
  required: ['roomId', 'line'],
} as const;

const activitySchema = z.object({ roomId: z.string(), line: z.string() });

const roomsOutputSchema = {
  type: 'object',
  properties: {
    rooms: {
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
  required: ['rooms'],
} as const;

const sharedRoomsOutputSchema = {
  type: 'object',
  properties: {
    rooms: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          outsideName: { type: 'string' },
          link: { type: 'string' },
          lines: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'outsideName', 'link', 'lines'],
      },
    },
  },
  required: ['rooms'],
} as const;

const accessRequestPayloadSchema = {
  type: 'object',
  properties: {
    email: { type: 'string' },
    dealName: { type: 'string' },
    dealPath: { type: 'string' },
  },
  required: ['email', 'dealName', 'dealPath'],
} as const;

const roomNoticePayloadSchema = {
  type: 'object',
  properties: {
    teamName: { type: 'string' },
    dealName: { type: 'string' },
    outsideName: { type: 'string' },
    roomPath: { type: 'string' },
  },
  required: ['teamName', 'dealName', 'outsideName', 'roomPath'],
} as const;

async function noticeEmail(notice: {
  subject: string;
  message: string;
  actionLabel: string;
  actionLink: string;
}) {
  const email = await renderLenderNoticeEmail({
    productName: 'Open Deal Book',
    ...notice,
  });

  return { subject: email.subject, body: email.html };
}

function roomNoticeWorkflow(
  deps: SellerWorkflowDeps,
  workflowId: string,
  wording: { verb: string; consequence: string },
) {
  return workflow(
    workflowId,
    async ({ step, payload }) => {
      await step.email('email', () =>
        noticeEmail({
          subject: `${payload.teamName} ${wording.verb} the seller room for ${payload.outsideName}`,
          message: `${payload.teamName} ${wording.verb} the seller room for ${payload.dealName}. ${wording.consequence}`,
          actionLabel: 'Open the room',
          actionLink: `${deps.siteUrl}${payload.roomPath}`,
        }),
      );
    },
    { payloadSchema: roomNoticePayloadSchema },
  );
}

export function buildSellerWorkflows(deps: SellerWorkflowDeps) {
  return [
    workflow(
      SELLER_ROOM_ACCESS_REQUESTED_WORKFLOW_ID,
      async ({ step, payload }) => {
        await step.email('email', () =>
          noticeEmail({
            subject: `${payload.email} asked to reopen the seller room for ${payload.dealName}`,
            message: `${payload.email} asked to reopen the seller room for ${payload.dealName}, which is closed. Reopen it from the deal to let them back in.`,
            actionLabel: 'Open the deal',
            actionLink: `${deps.siteUrl}${payload.dealPath}`,
          }),
        );
      },
      { payloadSchema: accessRequestPayloadSchema },
    ),
    roomNoticeWorkflow(deps, SELLER_ROOM_CLOSED_WORKFLOW_ID, {
      verb: 'closed',
      consequence: 'You can no longer open its files or questions.',
    }),
    roomNoticeWorkflow(deps, SELLER_ROOM_REOPENED_WORKFLOW_ID, {
      verb: 'reopened',
      consequence: 'You can open it again.',
    }),
    workflow(
      SELLER_ROOM_ACTIVITY_WORKFLOW_ID,
      async ({ step, subscriber }) => {
        const digest = await step.digest('daily-digest', () =>
          digestWindow(deps),
        );

        const managed = await step.custom(
          'managed-rooms',
          async () => {
            const activity = digest.events.map((event) =>
              activitySchema.parse(event.payload),
            );
            const rooms = await deps.loadManagedSellerRooms({
              userId: z.string().parse(subscriber.subscriberId),
              roomIds: [...new Set(activity.map((event) => event.roomId))],
            });

            return {
              rooms: rooms.map((room) => ({
                title: room.title,
                link: `${deps.siteUrl}${room.path}`,
                lines: activity
                  .filter((event) => event.roomId === room.roomId)
                  .map((event) => event.line),
              })),
            };
          },
          { outputSchema: roomsOutputSchema },
        );

        await step.email(
          'email',
          async () => {
            const email = await renderSellerActivityDigestEmail({
              productName: 'Open Deal Book',
              subject: 'Your sellers were busy today',
              heading: 'Your sellers were busy today',
              rooms: managed.rooms,
            });

            return { subject: email.subject, body: email.html };
          },
          { skip: () => managed.rooms.length === 0 },
        );
      },
      { payloadSchema: activityPayloadSchema },
    ),

    workflow(
      SELLER_ROOM_SHARED_WORKFLOW_ID,
      async ({ step, subscriber, payload }) => {
        const digest = await step.digest('daily-digest', () =>
          digestWindow(deps, payload.timezone),
        );

        const visible = await step.custom(
          'visible-items',
          async () => {
            const shared = digest.events.map((event) =>
              sharedEventSchema.parse(event.payload),
            );
            const idsOf = (kind: SharedEvent['kind']) =>
              shared
                .filter((event) => event.kind === kind)
                .map((event) => itemIdOf(event));
            const items = await deps.loadSellerDigestItems({
              userId: z.string().parse(subscriber.subscriberId),
              documentIds: idsOf('document'),
              folderIds: idsOf('folder'),
              meetingIds: idsOf('meeting'),
            });

            const entries = new Map<
              string,
              { item: SellerDigestItem; event: SharedEvent; isNew: boolean }
            >();

            for (const event of shared) {
              const item = items.find(
                (candidate) =>
                  candidate.kind === event.kind &&
                  candidate.itemId === itemIdOf(event) &&
                  candidate.roomId === event.roomId,
              );

              if (!item) {
                continue;
              }

              const key =
                item.kind === 'document'
                  ? `${item.roomId}/document/${item.folderId}/${item.name}`
                  : `${item.roomId}/${item.kind}/${item.itemId}`;
              const isNew = event.kind !== 'document' || !event.isNewVersion;
              const entry = entries.get(key);

              entries.set(key, {
                item,
                event,
                isNew: (entry?.isNew ?? false) || isNew,
              });
            }

            const rooms = new Map<
              string,
              {
                title: string;
                outsideName: string;
                link: string;
                lines: string[];
              }
            >();

            for (const { item, event, isNew } of entries.values()) {
              const room = rooms.get(item.roomId) ?? {
                title: `${item.dealName} with ${item.teamName}`,
                outsideName: item.outsideName,
                link: `${deps.siteUrl}/seller/rooms/${item.roomId}`,
                lines: [],
              };

              room.lines.push(lineFor(event, item.name, isNew));
              rooms.set(item.roomId, room);
            }

            return { rooms: [...rooms.values()] };
          },
          { outputSchema: sharedRoomsOutputSchema },
        );

        await step.email(
          'email',
          async () => {
            const email = await renderSellerActivityDigestEmail({
              productName: 'Open Deal Book',
              subject: `New in your room for ${new Intl.ListFormat('en').format(
                visible.rooms.map((room) => room.outsideName),
              )}`,
              heading: 'New in your seller room',
              rooms: visible.rooms,
            });

            return { subject: email.subject, body: email.html };
          },
          { skip: () => visible.rooms.length === 0 },
        );
      },
      { payloadSchema: sharedPayloadSchema },
    ),
  ];
}
