'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@odb/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@odb/ui/dialog';
import { MissingValue } from '@odb/ui/figure-value';
import { formatBytes } from '@odb/ui/format';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

import { DataRoomDocumentLink } from './data-room-document-link';

export interface EarlierVersion {
  id: string;
  version: number;
  sizeBytes: number | null;
  uploader: string | null;
  uploadedOn: string | null;
}

export function DataRoomVersionHistory({
  dealId,
  name,
  version,
  earlier,
}: {
  dealId: string;
  name: string;
  version: number;
  earlier: EarlierVersion[];
}) {
  const t = useTranslations('dataRoom');

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type={'button'}
          variant={'link'}
          size={'sm'}
          className={'h-auto p-0 tabular-nums'}
        >
          {t('versionHistory', { version })}
        </Button>
      </DialogTrigger>
      <DialogContent className={'sm:max-w-xl'} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t('history.title', { name })}</DialogTitle>
        </DialogHeader>
        <Table className={'tabular-nums'}>
          <TableHeader>
            <TableRow className={'hover:bg-transparent'}>
              <TableHead>{t('columns.version')}</TableHead>
              <TableHead className={'text-right'}>
                {t('columns.size')}
              </TableHead>
              <TableHead>{t('columns.uploaded')}</TableHead>
              <TableHead>
                <span className={'sr-only'}>{t('columns.actions')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {earlier.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className={'py-1.5'}>
                  {t('version', { version: entry.version })}
                </TableCell>
                <TableCell className={'py-1.5 text-right'}>
                  {entry.sizeBytes === null ? (
                    <MissingValue label={t('sizeMissing')} />
                  ) : (
                    formatBytes(entry.sizeBytes)
                  )}
                </TableCell>
                <TableCell className={'py-1.5'}>
                  <span className={'block'}>
                    {entry.uploader ?? (
                      <MissingValue label={t('uploaderMissing')} />
                    )}
                  </span>
                  <span className={'text-muted-foreground block text-xs'}>
                    {entry.uploadedOn}
                  </span>
                </TableCell>
                <TableCell className={'py-1.5 text-right'}>
                  <DataRoomDocumentLink dealId={dealId} documentId={entry.id} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
