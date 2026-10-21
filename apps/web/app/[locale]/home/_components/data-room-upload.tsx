'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { stageUpload } from '@odb/data-room/uploads/actions';
import { Button } from '@odb/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@odb/ui/select';
import { Spinner } from '@odb/ui/spinner';

import { expandDataRoomUpload } from './expand-data-room-upload';

interface FolderOption {
  id: string;
  name: string;
}

interface DataRoomUploadProps {
  dealId: string;
  folders: FolderOption[];
  folderId: string;
}

function uploadKind(files: File[]): 'single' | 'group' | 'zip' {
  if (files.length === 1 && files[0]!.name.toLowerCase().endsWith('.zip')) {
    return 'zip';
  }

  return files.length === 1 ? 'single' : 'group';
}

export function DataRoomUpload({
  dealId,
  folders,
  folderId,
}: DataRoomUploadProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [targetFolderId, setTargetFolderId] = useState(folderId);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [refused, setRefused] = useState<string[]>([]);
  const [isUploading, startUploading] = useTransition();

  function onUpload() {
    startUploading(async () => {
      const kind = uploadKind(files);

      const staged = await stageUpload({
        dealId,
        kind,
        sourceFilename: kind === 'zip' ? files[0]!.name : null,
        files: files.map((file) => ({
          originalPath: file.name,
          contentType: file.type || null,
          body: file,
        })),
      });

      if (!staged.ok) {
        setUploaded(null);
        setRefused([staged.refusal]);
        return;
      }

      const expanded = await expandDataRoomUpload({
        dealId,
        batchId: staged.value.batch.id,
        targetFolderId,
      });

      if (!expanded.ok) {
        setUploaded(null);
        setRefused([expanded.refusal]);
        return;
      }

      const result = expanded.value;

      const folderName = folders.find(
        (folder) => folder.id === targetFolderId,
      )!.name;
      const imported = result.items
        .filter((item) => item.status === 'imported')
        .map((item) => item.original_path);

      setUploaded(
        imported.length > 0
          ? `Uploaded ${imported.join(', ')} to ${folderName}`
          : null,
      );
      setRefused(
        result.items
          .filter((item) => item.status === 'failed')
          .map(
            (item) => `${item.original_path} was not uploaded: ${item.error}`,
          ),
      );
      setFiles([]);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className={'flex flex-col items-end gap-2'}>
      {open ? (
        <div
          className={
            'border-input flex w-full flex-col gap-3 rounded-md border border-dashed p-4 sm:flex-row sm:items-end'
          }
        >
          <label className={'flex flex-1 flex-col gap-1 text-sm'}>
            <span className={'font-medium'}>Files or a .zip</span>
            <input
              type={'file'}
              multiple
              className={'text-sm'}
              onChange={(event) =>
                setFiles(Array.from(event.target.files ?? []))
              }
            />
          </label>
          <div className={'flex flex-col gap-1 text-sm'}>
            <span className={'font-medium'}>Folder</span>
            <Select value={targetFolderId} onValueChange={setTargetFolderId}>
              <SelectTrigger className={'min-w-48'}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {folders.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    {folder.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className={'flex gap-2'}>
            <Button
              type={'button'}
              variant={'ghost'}
              onClick={() => setOpen(false)}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              type={'button'}
              onClick={onUpload}
              disabled={isUploading || files.length === 0}
            >
              {isUploading ? <Spinner /> : null}
              {isUploading ? 'Uploading' : 'Upload'}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type={'button'}
          variant={'outline'}
          size={'sm'}
          onClick={() => setOpen(true)}
        >
          Upload
        </Button>
      )}
      {uploaded ? (
        <p role={'status'} className={'text-muted-foreground text-sm'}>
          {uploaded}
        </p>
      ) : null}
      {refused.map((line) => (
        <p key={line} role={'alert'} className={'text-destructive text-sm'}>
          {line}
        </p>
      ))}
    </div>
  );
}
