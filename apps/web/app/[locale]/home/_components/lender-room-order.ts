import type { Enums } from '@odb/supabase';

export type RoomAccess =
  | { kind: 'open'; expiresAt: string | null }
  | { kind: 'closed' }
  | { kind: 'expired'; expiredAt: string };

export function roomAccess(room: {
  closedAt: string | null;
  expiresAt: string | null;
  isOpen: boolean | null;
}): RoomAccess {
  if (room.closedAt !== null) {
    return { kind: 'closed' };
  }

  return room.isOpen || room.expiresAt === null
    ? { kind: 'open', expiresAt: room.expiresAt }
    : { kind: 'expired', expiredAt: room.expiresAt };
}

export function lastLenderActivityAt(
  feed: { side: Enums<'lender_side'>; at: string }[],
): string | null {
  return feed
    .filter((entry) => entry.side === 'lender')
    .reduce<string | null>(
      (latest, entry) =>
        latest === null || Date.parse(entry.at) > Date.parse(latest)
          ? entry.at
          : latest,
      null,
    );
}

export function orderRooms<
  Row extends {
    access: { kind: RoomAccess['kind'] };
    waitingOnUs: number;
    lastActivityAt: string | null;
  },
>(rows: Row[]): Row[] {
  const recency = (row: Row) =>
    row.lastActivityAt === null ? -Infinity : Date.parse(row.lastActivityAt);

  return rows.toSorted(
    (a, b) =>
      Number(b.access.kind === 'open') - Number(a.access.kind === 'open') ||
      Number(b.waitingOnUs > 0) - Number(a.waitingOnUs > 0) ||
      recency(b) - recency(a),
  );
}
