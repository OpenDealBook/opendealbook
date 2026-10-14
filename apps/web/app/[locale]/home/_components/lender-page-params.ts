import { z } from 'zod';

import type { MarkedRoomFolder } from '@odb/lender-rooms/contents/listing.ts';
import type { LoadedRoomListing } from '@odb/lender-rooms/contents/load-listing.ts';
import type { Enums } from '@odb/supabase';

export function areUuids(...ids: string[]): boolean {
  return ids.every((id) => z.uuid().safeParse(id).success);
}

const kindBySegment: Record<string, Enums<'lender_ask_kind'>> = {
  asks: 'ask',
  forms: 'form',
};

export function requestKind(segment: string): Enums<'lender_ask_kind'> | null {
  return kindBySegment[segment] ?? null;
}

const roomTabs = ['requests', 'files', 'activity', 'people', 'settings'];

export function roomTab(tab: string | undefined): string {
  return tab !== undefined && roomTabs.includes(tab) ? tab : 'requests';
}

export function dealTeamRoots(listing: LoadedRoomListing): {
  master: MarkedRoomFolder;
  private: MarkedRoomFolder;
} | null {
  if (listing.viewer !== 'deal_team') {
    return null;
  }

  if (!listing.master || !listing.private) {
    throw new Error('Lender room is missing a root folder');
  }

  return { master: listing.master, private: listing.private };
}
