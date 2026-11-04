import type { IndexedFolder } from './data-room-index';

export function folderAnchor(folderId: string): string {
  return `data-room-folder-${folderId}`;
}

function Branch({ folders }: { folders: IndexedFolder[] }) {
  return (
    <ul className={'flex flex-col'}>
      {folders.map((folder) => (
        <li key={folder.id}>
          <a
            href={`#${folderAnchor(folder.id)}`}
            className={
              'hover:bg-muted focus-visible:ring-ring flex gap-3 rounded-sm px-2 py-1 text-sm outline-none focus-visible:ring-2'
            }
          >
            <span className={'text-muted-foreground tabular-nums'}>
              {folder.index}
            </span>
            <span className={'min-w-0 truncate'}>{folder.name}</span>
          </a>
          {folder.folders.length > 0 ? (
            <div className={'border-border ml-3 border-l pl-1'}>
              <Branch folders={folder.folders} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function DataRoomFolderTree({
  label,
  folders,
}: {
  label: string;
  folders: IndexedFolder[];
}) {
  return (
    <nav aria-label={label} className={'lg:sticky lg:top-4 lg:self-start'}>
      <Branch folders={folders} />
    </nav>
  );
}
