import { z } from 'zod';

import type { LenderDigestRoom } from '@odb/email-templates';
import type { Database } from '@odb/supabase';

const LINES_SHOWN_PER_ROOM = 25;

export const digestedEventSchema = z.union([
  z.object({ kind: z.literal('faq'), entryId: z.string() }),
  z.object({ documentId: z.string(), isNewVersion: z.boolean() }),
]);

type DigestedEvent = z.infer<typeof digestedEventSchema>;

type Functions = Database['public']['Functions'];

export type VisibleDocument =
  Functions['lender_visible_documents']['Returns'][number] & {
    outside_name: string;
  };

export type VisibleFaqEntry =
  Functions['lender_visible_faq_entries']['Returns'][number] & {
    outside_name: string;
  };

type DigestRoom = Omit<LenderDigestRoom, 'link' | 'faqLink'> & {
  roomId: string;
};

export function groupVisibleItems(
  digested: DigestedEvent[],
  visibleDocuments: VisibleDocument[],
  visibleFaqEntries: VisibleFaqEntry[],
): DigestRoom[] {
  const documentsById = new Map(
    visibleDocuments.map((document) => [document.document_id, document]),
  );
  const faqEntriesById = new Map(
    visibleFaqEntries.map((entry) => [entry.entry_id, entry]),
  );
  const rooms = new Map<string, DigestRoom>();
  const lines = new Map<string, DigestRoom['items'][number]>();

  const roomOf = (roomId: string, name: string) => {
    const room = rooms.get(roomId) ?? { roomId, name, items: [], moreCount: 0 };
    rooms.set(roomId, room);
    return room;
  };

  for (const event of digested) {
    if ('entryId' in event) {
      const entry = faqEntriesById.get(event.entryId);
      const lineKey = `faq/${event.entryId}`;
      if (!entry || lines.has(lineKey)) {
        continue;
      }

      const line = { kind: 'faq' as const, question: entry.question };
      roomOf(entry.room_id, entry.outside_name).items.push(line);
      lines.set(lineKey, line);
      continue;
    }

    const document = documentsById.get(event.documentId);
    if (!document) {
      continue;
    }

    const lineKey = `${document.room_id}/${document.folder_id}/${document.name}`;
    const line = lines.get(lineKey);

    if (!line) {
      const added = {
        kind: 'document' as const,
        name: document.name,
        status: event.isNewVersion ? ('updated' as const) : ('new' as const),
      };
      roomOf(document.room_id, document.outside_name).items.push(added);
      lines.set(lineKey, added);
    } else if (line.kind === 'document' && !event.isNewVersion) {
      line.status = 'new';
    }
  }

  return [...rooms.values()].map((room) => ({
    ...room,
    items: room.items.slice(0, LINES_SHOWN_PER_ROOM),
    moreCount: Math.max(0, room.items.length - LINES_SHOWN_PER_ROOM),
  }));
}
