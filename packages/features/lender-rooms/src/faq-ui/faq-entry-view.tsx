import { FileTextIcon } from 'lucide-react';

import type { RoomFaqEntry } from '../faq/queries';
import { LocalTime } from '../requests-ui/local-time';

export function FaqEntryView({
  roomId,
  entry,
}: {
  roomId: string;
  entry: RoomFaqEntry;
}) {
  const edited =
    Date.parse(entry.updatedAt) > Date.parse(entry.firstPublishedAt);

  return (
    <div className={'flex flex-col gap-3'}>
      <p className={'leading-relaxed whitespace-pre-line'}>{entry.answer}</p>
      {entry.files.length > 0 ? (
        <ul className={'flex flex-col gap-1'}>
          {entry.files.map((file) => (
            <li key={file.id}>
              <a
                href={`/lender/${roomId}/faq/files/${file.id}?disposition=preview`}
                target={'_blank'}
                rel={'noreferrer'}
                className={
                  'hover:text-foreground text-muted-foreground inline-flex min-h-6 items-center gap-1.5 text-sm underline-offset-4 hover:underline'
                }
              >
                <FileTextIcon aria-hidden className={'size-4 shrink-0'} />
                {file.name}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {edited ? (
        <p className={'text-muted-foreground text-xs'}>
          Updated <LocalTime at={entry.updatedAt} />
        </p>
      ) : null}
    </div>
  );
}
