import { z } from 'zod';

import type { LenderRoomRow } from './lender-room-list';
import { orderRooms, roomAccess } from './lender-room-order';

const roomStatus = z.enum([
  'invited',
  'reviewing',
  'term_sheet',
  'declined',
  'selected',
]);

const teamRoomSchema = z.object({
  room_id: z.string(),
  deal_id: z.string(),
  deal_name: z.string().nullable(),
  deal_description: z.string().nullable(),
  room_name: z.string(),
  status: roomStatus,
  expires_at: z.string().nullable(),
  closed_at: z.string().nullable(),
  is_open: z.boolean().nullable(),
  brand_logo_path: z.string().nullable(),
  member_count: z.number(),
  requests_waiting_on_team: z.number(),
  last_lender_activity_at: z.string().nullable(),
  last_lender_action_at: z.string().nullable(),
});

export interface TeamRoom extends Omit<LenderRoomRow, 'logoUrl'> {
  dealId: string;
  dealLabel: string | null;
  logoPath: string | null;
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

export function teamRooms(raw: unknown): TeamRoom[] {
  return orderRooms(
    z
      .array(teamRoomSchema)
      .parse(raw)
      .map((room) => ({
        id: room.room_id,
        dealId: room.deal_id,
        dealLabel: room.deal_name ?? room.deal_description,
        name: room.room_name,
        initials: initialsOf(room.room_name),
        logoPath: room.brand_logo_path,
        status: room.status,
        access: roomAccess({
          closedAt: room.closed_at,
          expiresAt: room.expires_at,
          isOpen: room.is_open,
        }),
        peopleCount: room.member_count,
        waitingOnUs: room.requests_waiting_on_team,
        lastActivityAt: room.last_lender_activity_at,
        lastActionAt: room.last_lender_action_at,
      })),
  );
}

const teamContactSchema = z.object({
  user_id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  has_signed_in: z.boolean(),
  room_id: z.string(),
  room_name: z.string(),
  deal_id: z.string(),
  deal_name: z.string().nullable(),
  deal_description: z.string().nullable(),
  room_status: roomStatus,
  brand_name: z.string().nullable(),
  brand_logo_path: z.string().nullable(),
  invited_by_email: z.string().nullable(),
  invited_by_name: z.string().nullable(),
  invited_at: z.string(),
  removed_at: z.string().nullable(),
  first_visit_at: z.string().nullable(),
  last_visit_at: z.string().nullable(),
  files_viewed: z.number(),
  downloads: z.number(),
  requests_opened: z.number(),
  requests_waiting_on_team: z.number(),
  requests_waiting_on_lender: z.number(),
  forms_out_for_signature: z.number(),
});

export interface TeamContact {
  userId: string;
  email: string;
  name: string | null;
  hasSignedIn: boolean;
  roomId: string;
  roomName: string;
  dealId: string;
  dealLabel: string | null;
  roomStatus: z.infer<typeof roomStatus>;
  institution: string;
  logoPath: string | null;
  invitedBy: string | null;
  invitedAt: string;
  removedAt: string | null;
  firstVisitAt: string | null;
  lastVisitAt: string | null;
  filesViewed: number;
  downloads: number;
  requestsOpened: number;
  waitingOnTeam: number;
  waitingOnLender: number;
  formsOutForSignature: number;
}

export function teamContacts(raw: unknown): TeamContact[] {
  const lastVisit = (contact: TeamContact) =>
    contact.lastVisitAt === null ? -Infinity : Date.parse(contact.lastVisitAt);

  return z
    .array(teamContactSchema)
    .parse(raw)
    .map(
      (contact): TeamContact => ({
        userId: contact.user_id,
        email: contact.email,
        name: contact.name,
        hasSignedIn: contact.has_signed_in,
        roomId: contact.room_id,
        roomName: contact.room_name,
        dealId: contact.deal_id,
        dealLabel: contact.deal_name ?? contact.deal_description,
        roomStatus: contact.room_status,
        institution: contact.brand_name ?? contact.room_name,
        logoPath: contact.brand_logo_path,
        invitedBy: contact.invited_by_name ?? contact.invited_by_email,
        invitedAt: contact.invited_at,
        removedAt: contact.removed_at,
        firstVisitAt: contact.first_visit_at,
        lastVisitAt: contact.last_visit_at,
        filesViewed: contact.files_viewed,
        downloads: contact.downloads,
        requestsOpened: contact.requests_opened,
        waitingOnTeam: contact.requests_waiting_on_team,
        waitingOnLender: contact.requests_waiting_on_lender,
        formsOutForSignature: contact.forms_out_for_signature,
      }),
    )
    .toSorted(
      (a, b) =>
        lastVisit(b) - lastVisit(a) ||
        (a.name ?? a.email).localeCompare(b.name ?? b.email, 'en'),
    );
}

export function filterContacts<
  Row extends Pick<TeamContact, 'name' | 'email' | 'institution' | 'dealLabel'>,
>(rows: Row[], text: string): Row[] {
  const needle = text.trim().toLowerCase();

  return rows.filter((row) =>
    [row.name, row.email, row.institution, row.dealLabel].some((value) =>
      value?.toLowerCase().includes(needle),
    ),
  );
}
