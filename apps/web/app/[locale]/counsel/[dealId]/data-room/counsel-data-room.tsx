import type { FolderGroup } from '@odb/data-room';

import { counselFilePath } from './file-path';

export function CounselDataRoom({
  dealId,
  groups,
}: {
  dealId: string;
  groups: FolderGroup[];
}) {
  if (groups.length === 0) {
    return <p className={'text-muted-foreground'}>
        The deal team hasn&apos;t shared anything here yet.
      </p>;
  }

  return groups.map((group) => (
    <section key={group.folderId} className={'flex flex-col gap-1'}>
      <h2 className={'font-medium'}>{group.path}</h2>
      {group.documents.length === 0 ? (
        <p className={'text-muted-foreground text-sm'}>No files</p>
      ) : (
        <ul className={'flex flex-col gap-1 text-sm'}>
          {group.documents.map((document) => (
            <li key={document.id}>
              <a
                className={'underline'}
                href={counselFilePath(dealId, document.id)}
              >
                {document.name}
              </a>{' '}
              (version {document.version})
            </li>
          ))}
        </ul>
      )}
    </section>
  ));
}
