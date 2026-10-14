'use client';

import { cn } from '@odb/ui/utils';

import { LiveRegion } from './refusal-note';
import { AttachButton, UploadList, type Uploads, useFileDrop } from './uploads';

export function SingleFilePicker({
  uploads,
  chooseLabel,
}: {
  uploads: Uploads;
  chooseLabel: string;
}) {
  const drop = useFileDrop(uploads.replaceWithFirst);

  return (
    <div
      {...drop.dropProps}
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-dashed p-3',
        drop.isOver && 'border-ring bg-secondary',
      )}
    >
      <div className={'flex flex-wrap items-center gap-x-2'}>
        <AttachButton onPick={uploads.replaceWithFirst} multiple={false}>
          {uploads.queue.length > 0 ? 'Choose a different file' : chooseLabel}
        </AttachButton>
        <span className={'text-muted-foreground text-sm'}>or drop it here</span>
      </div>
      <UploadList
        queue={uploads.queue}
        onRemove={uploads.remove}
        onRetry={uploads.retry}
      />
      <LiveRegion message={uploads.announcement} />
    </div>
  );
}
