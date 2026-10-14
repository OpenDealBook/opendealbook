import { z } from 'zod';

import type { LenderDigestRoom } from '@odb/email-templates';
import type { Database } from '@odb/supabase';

const DOCUMENTS_SHOWN_PER_ROOM = 25;

export const digestedDocumentSchema = z.object({
  documentId: z.string(),
  isNewVersion: z.boolean(),
});

export type VisibleDocument =
  Database['public']['Functions']['lender_visible_documents']['Returns'][number];

type DigestRoom = Omit<LenderDigestRoom, 'link'> & { roomId: string };

export function groupVisibleDocuments(
  digested: z.infer<typeof digestedDocumentSchema>[],
  visible: VisibleDocument[],
): DigestRoom[] {
  const visibleById = new Map(
    visible.map((document) => [document.document_id, document]),
  );
  const rooms = new Map<string, DigestRoom>();
  const lines = new Map<string, DigestRoom['documents'][number]>();

  for (const { documentId, isNewVersion } of digested) {
    const document = visibleById.get(documentId);
    if (!document) {
      continue;
    }

    const room = rooms.get(document.room_id) ?? {
      roomId: document.room_id,
      name: document.room_name,
      documents: [],
      moreCount: 0,
    };
    const lineKey = `${document.room_id}/${document.folder_id}/${document.name}`;
    const line = lines.get(lineKey);

    if (!line) {
      const added = {
        name: document.name,
        status: isNewVersion ? ('updated' as const) : ('new' as const),
      };
      room.documents.push(added);
      lines.set(lineKey, added);
    } else if (!isNewVersion) {
      line.status = 'new';
    }
    rooms.set(document.room_id, room);
  }

  return [...rooms.values()].map((room) => ({
    ...room,
    documents: room.documents.slice(0, DOCUMENTS_SHOWN_PER_ROOM),
    moreCount: Math.max(0, room.documents.length - DOCUMENTS_SHOWN_PER_ROOM),
  }));
}
