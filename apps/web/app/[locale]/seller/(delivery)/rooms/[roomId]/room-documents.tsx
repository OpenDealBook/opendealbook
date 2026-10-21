import { sellerAttachmentName } from '@odb/seller-rooms/files/document-name.ts';
import { sellerRoomPath } from '@odb/seller-rooms/members/entry-rules.ts';

export interface RoomDocument {
  share_id: string;
  template_name: string | null;
  firm_name: string | null;
  sent_at: string | null;
}

export function RoomDocuments({
  roomId,
  teamName,
  documents,
}: {
  roomId: string;
  teamName: string;
  documents: RoomDocument[];
}) {
  if (documents.length === 0) {
    return null;
  }

  return (
    <section className={'flex flex-col gap-2'}>
      <h2 className={'text-lg font-semibold'}>Documents from {teamName}</h2>
      <ul className={'flex flex-col gap-1'}>
        {documents.map((document) => (
          <li key={document.share_id}>
            <a
              href={`${sellerRoomPath(roomId)}/documents/${document.share_id}`}
              target={'_blank'}
              rel={'noreferrer'}
              className={'underline'}
            >
              {sellerAttachmentName(document.template_name, document.firm_name)}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
