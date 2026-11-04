import type { ReactNode } from 'react';

import { FolderIcon, FolderPlusIcon } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

import { fetchDocuments, fetchFolders } from '@odb/data-room';
import { DATA_ROOM_BUCKET } from '@odb/data-room/storage';
import { TypeIcon } from '@odb/lender-rooms/room-browser/type-icon.tsx';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { EmptyState } from '@odb/ui/empty-state';
import { MissingValue } from '@odb/ui/figure-value';
import { formatBytes, formatTimestamp } from '@odb/ui/format';
import { PageHeader } from '@odb/ui/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

import {
  DataRoomDocumentLink,
  OpenDataRoomWindow,
} from './data-room-document-link';
import { DataRoomFolderTree, folderAnchor } from './data-room-folder-tree';
import {
  type FileVersion,
  type IndexedFolder,
  indexDataRoom,
} from './data-room-index';
import { DataRoomNewFolder } from './data-room-new-folder';
import { DataRoomUpload } from './data-room-upload';
import { DataRoomVersionHistory } from './data-room-version-history';
import { viewerTimeZone } from './viewer-time-zone';

type Client = ReturnType<typeof getSupabaseServerClient>;

const LIST_PAGE_SIZE = 1000;
const VIEW_ACTIONS = ['document_previewed', 'document_downloaded'] as const;

async function objectSizes(
  client: Client,
  dealId: string,
): Promise<Map<string, number>> {
  const prefix = `deal/${dealId}`;
  const sizes = new Map<string, number>();

  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data, error } = await client.storage
      .from(DATA_ROOM_BUCKET)
      .list(prefix, { limit: LIST_PAGE_SIZE, offset });

    if (error) {
      throw error;
    }

    for (const object of data) {
      if (object.metadata !== null) {
        sizes.set(`${prefix}/${object.name}`, object.metadata.size);
      }
    }

    if (data.length < LIST_PAGE_SIZE) {
      return sizes;
    }
  }
}

async function everyRow<Row>(
  page: (from: number, to: number) => PromiseLike<{ data: Row[] }>,
): Promise<Row[]> {
  const rows: Row[] = [];

  for (let from = 0; ; from += LIST_PAGE_SIZE) {
    const { data } = await page(from, from + LIST_PAGE_SIZE - 1);
    rows.push(...data);

    if (data.length < LIST_PAGE_SIZE) {
      return rows;
    }
  }
}

async function documentViews(
  client: Client,
  dealId: string,
): Promise<Map<string, number>> {
  const [lender, seller] = await Promise.all([
    everyRow((from, to) =>
      client
        .from('lender_room_activity')
        .select('id, dr_document_id, lender_room!inner(deal_id)')
        .eq('lender_room.deal_id', dealId)
        .in('action', VIEW_ACTIONS)
        .not('dr_document_id', 'is', null)
        .order('id')
        .range(from, to)
        .throwOnError(),
    ),
    everyRow((from, to) =>
      client
        .from('seller_room_activity')
        .select('id, dr_document_id, seller_room!inner(deal_id)')
        .eq('seller_room.deal_id', dealId)
        .in('action', VIEW_ACTIONS)
        .not('dr_document_id', 'is', null)
        .order('id')
        .range(from, to)
        .throwOnError(),
    ),
  ]);
  const views = new Map<string, number>();

  for (const { dr_document_id } of [...lender, ...seller]) {
    views.set(dr_document_id!, (views.get(dr_document_id!) ?? 0) + 1);
  }

  return views;
}

function* folderOptions(
  folders: IndexedFolder[],
  trail: string[] = [],
): Generator<{ id: string; name: string }> {
  for (const folder of folders) {
    const path = [...trail, folder.name];

    yield { id: folder.id, name: path.join(' / ') };
    yield* folderOptions(folder.folders, path);
  }
}

function indent(depth: number) {
  return { paddingLeft: `${depth * 1.25}rem` };
}

export async function DataRoomSection({
  dealId,
  accountId,
}: {
  dealId: string;
  accountId: string;
}) {
  const client = getSupabaseServerClient();

  const [
    folderRows,
    documentRows,
    { data: people },
    { data: canUpload },
    { data: canManage },
    sizes,
    views,
    locale,
    timeZone,
    t,
  ] = await Promise.all([
    fetchFolders(client, dealId),
    fetchDocuments(client, dealId),
    client.rpc('deal_people', { deal_id: dealId }).throwOnError(),
    client
      .rpc('has_deal_permission', {
        deal_id: dealId,
        permission: 'deals.work',
      })
      .throwOnError(),
    client
      .rpc('has_deal_permission', {
        deal_id: dealId,
        permission: 'deals.manage',
      })
      .throwOnError(),
    objectSizes(client, dealId),
    documentViews(client, dealId),
    getLocale(),
    viewerTimeZone(accountId),
    getTranslations('dataRoom'),
  ]);

  const room = indexDataRoom(folderRows, documentRows);
  const targets = [...folderOptions(room)];
  const nameOf = new Map(people.map((person) => [person.user_id, person.name]));
  const showViews = views.size > 0;
  const columnCount = showViews ? 7 : 6;
  const newFolder = canManage ? (
    <DataRoomNewFolder dealId={dealId} folders={targets} />
  ) : null;

  const sizeOf = (version: FileVersion) =>
    sizes.get(version.storagePath) ?? null;
  const uploaderOf = (version: FileVersion) =>
    version.uploadedBy === null
      ? null
      : (nameOf.get(version.uploadedBy) ?? null);
  const uploadedOn = (version: FileVersion) =>
    version.uploadedAt === null
      ? null
      : formatTimestamp(version.uploadedAt, locale, timeZone);

  const shownSize = (size: number | null): ReactNode =>
    size === null ? (
      <MissingValue label={t('sizeMissing')} />
    ) : (
      formatBytes(size)
    );

  const rowsOf = (folder: IndexedFolder, depth: number): ReactNode[] => [
    <TableRow
      key={folder.id}
      id={folderAnchor(folder.id)}
      className={'bg-muted/40 hover:bg-muted/40 scroll-mt-4'}
    >
      <TableCell className={'text-muted-foreground py-1.5'}>
        {folder.index}
      </TableCell>
      <TableCell
        colSpan={columnCount - 1}
        className={'py-1.5 font-medium'}
        style={indent(depth)}
      >
        <span className={'flex items-center gap-2'}>
          <FolderIcon
            aria-hidden
            className={'text-muted-foreground size-4 shrink-0'}
          />
          {folder.name}
        </span>
      </TableCell>
    </TableRow>,
    folder.files.length === 0 && folder.folders.length === 0 ? (
      <TableRow key={`${folder.id}-empty`} className={'hover:bg-transparent'}>
        <TableCell colSpan={columnCount} className={'py-3'}>
          <EmptyState
            title={t('emptyFolder.title', {
              folder: folder.name,
            })}
            description={t(
              canUpload
                ? 'emptyFolder.description'
                : 'emptyFolder.descriptionNoAccess',
            )}
            action={
              canUpload ? (
                <DataRoomUpload
                  dealId={dealId}
                  folders={targets}
                  folderId={folder.id}
                />
              ) : null
            }
          />
        </TableCell>
      </TableRow>
    ) : null,
    ...folder.folders.flatMap((child) => rowsOf(child, depth + 1)),
    ...folder.files.map((file) => (
      <TableRow key={file.id}>
        <TableCell className={'text-muted-foreground py-1.5'}>
          {file.index}
        </TableCell>
        <TableCell className={'py-1.5'} style={indent(depth + 1)}>
          <span className={'flex min-w-0 items-center gap-2'}>
            <TypeIcon
              type={file.type}
              className={'text-muted-foreground size-4 shrink-0'}
            />
            <span className={'truncate'}>{file.name}</span>
          </span>
        </TableCell>
        <TableCell className={'py-1.5 text-right'}>
          {shownSize(sizeOf(file))}
        </TableCell>
        <TableCell className={'py-1.5'}>
          <span className={'block'}>
            {uploaderOf(file) ?? <MissingValue label={t('uploaderMissing')} />}
          </span>
          <span className={'text-muted-foreground block text-xs'}>
            {uploadedOn(file)}
          </span>
        </TableCell>
        <TableCell className={'py-1.5'}>
          {file.earlier.length === 0 ? (
            t('version', { version: file.version })
          ) : (
            <DataRoomVersionHistory
              dealId={dealId}
              name={file.name}
              version={file.version}
              earlier={file.earlier.map((earlier) => ({
                id: earlier.id,
                version: earlier.version,
                sizeBytes: sizeOf(earlier),
                uploader: uploaderOf(earlier),
                uploadedOn: uploadedOn(earlier),
              }))}
            />
          )}
        </TableCell>
        {showViews ? (
          <TableCell className={'py-1.5 text-right'}>
            {[file, ...file.earlier].reduce(
              (total, version) => total + (views.get(version.id) ?? 0),
              0,
            )}
          </TableCell>
        ) : null}
        <TableCell className={'py-1.5 text-right'}>
          <DataRoomDocumentLink dealId={dealId} documentId={file.id} />
        </TableCell>
      </TableRow>
    )),
  ];

  return (
    <section className={'flex flex-col gap-6'}>
      <PageHeader
        level={2}
        title={t('title')}
        actions={<OpenDataRoomWindow />}
      />
      {room.length === 0 ? (
        <EmptyState
          icon={FolderPlusIcon}
          title={t('emptyRoom.title')}
          description={t(
            canManage
              ? 'emptyRoom.description'
              : 'emptyRoom.descriptionNoAccess',
          )}
          action={newFolder}
        />
      ) : (
        <div className={'grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]'}>
          <DataRoomFolderTree label={t('folders')} folders={room} />
          <div className={'flex min-w-0 flex-col gap-3'}>
            {canUpload || canManage ? (
              <div className={'flex items-start justify-end gap-2'}>
                {newFolder}
                {canUpload ? (
                  <DataRoomUpload
                    dealId={dealId}
                    folders={targets}
                    folderId={null}
                  />
                ) : null}
              </div>
            ) : null}
            <Table className={'tabular-nums'}>
              <TableHeader>
                <TableRow className={'hover:bg-transparent'}>
                  <TableHead className={'w-16'}>{t('columns.index')}</TableHead>
                  <TableHead>{t('columns.name')}</TableHead>
                  <TableHead className={'text-right'}>
                    {t('columns.size')}
                  </TableHead>
                  <TableHead>{t('columns.uploaded')}</TableHead>
                  <TableHead>{t('columns.version')}</TableHead>
                  {showViews ? (
                    <TableHead className={'text-right'}>
                      {t('columns.views')}
                    </TableHead>
                  ) : null}
                  <TableHead>
                    <span className={'sr-only'}>{t('columns.actions')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {room.flatMap((folder) => rowsOf(folder, 0))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </section>
  );
}
