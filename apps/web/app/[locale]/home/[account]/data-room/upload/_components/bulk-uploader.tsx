'use client';

import { useState, useTransition } from 'react';

import type { ExpandResult, StagedBatch } from '@odb/data-room';
import { expandUploadBatch, stageUpload } from '@odb/data-room/server';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { Label } from '@odb/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@odb/ui/select';
import { Spinner } from '@odb/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

export interface FolderOption {
  id: string;
  name: string;
}

interface BulkUploaderProps {
  dealId: string;
  folders: FolderOption[];
}

type ItemStatus = 'pending' | 'imported' | 'failed';

const STATUS_VARIANT: Record<
  ItemStatus,
  'default' | 'secondary' | 'destructive'
> = {
  pending: 'secondary',
  imported: 'default',
  failed: 'destructive',
};

function detectKind(files: File[]): 'single' | 'group' | 'zip' {
  if (files.length === 1 && files[0]!.name.toLowerCase().endsWith('.zip')) {
    return 'zip';
  }

  return files.length === 1 ? 'single' : 'group';
}

function relativePath(file: File): string {
  const withRelative = file as File & { webkitRelativePath?: string };

  return withRelative.webkitRelativePath || file.name;
}

export function BulkUploader({ dealId, folders }: BulkUploaderProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [batch, setBatch] = useState<StagedBatch | null>(null);
  const [targetFolderId, setTargetFolderId] = useState('');
  const [expansion, setExpansion] = useState<ExpandResult | null>(null);
  const [isStaging, startStaging] = useTransition();
  const [isExpanding, startExpanding] = useTransition();

  function onStage() {
    if (files.length === 0) {
      return;
    }

    startStaging(async () => {
      const kind = detectKind(files);

      const staged = await stageUpload({
        dealId,
        kind,
        sourceFilename: kind === 'zip' ? files[0]!.name : null,
        files: files.map((file) => ({
          originalPath: relativePath(file),
          contentType: file.type || null,
          body: file,
        })),
      });

      setBatch(staged);
      setExpansion(null);
    });
  }

  function onExpand() {
    if (!batch || !targetFolderId) {
      return;
    }

    startExpanding(async () => {
      const result = await expandUploadBatch({
        dealId,
        batchId: batch.batch.id,
        targetFolderId,
      });

      setExpansion(result);
    });
  }

  const rows = expansion?.items ?? batch?.items ?? [];

  return (
    <div className={'flex flex-col gap-6'}>
      <Card>
        <CardHeader>
          <CardTitle>Upload documents</CardTitle>
        </CardHeader>
        <CardContent className={'flex flex-col gap-4'}>
          <label
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              setFiles(Array.from(event.dataTransfer.files));
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed p-8 text-center text-sm ${
              dragging ? 'border-primary bg-accent' : 'border-input'
            }`}
          >
            <span className={'font-medium'}>
              Drop a file, several files, or a .zip archive
            </span>
            <span className={'text-muted-foreground'}>
              or click to choose from your computer
            </span>
            <input
              type={'file'}
              multiple
              className={'hidden'}
              onChange={(event) =>
                setFiles(Array.from(event.target.files ?? []))
              }
            />
          </label>

          {files.length > 0 ? (
            <p className={'text-muted-foreground text-sm'}>
              {files.length} file{files.length === 1 ? '' : 's'} selected
              {' · '}
              {detectKind(files)} upload
            </p>
          ) : null}

          <div>
            <Button
              type={'button'}
              onClick={onStage}
              disabled={isStaging || files.length === 0}
            >
              {isStaging ? <Spinner /> : null}
              {isStaging ? 'Staging' : 'Stage upload'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {batch ? (
        <Card>
          <CardHeader>
            <CardTitle>
              Batch {batch.batch.status} · {batch.batch.file_count} file
              {batch.batch.file_count === 1 ? '' : 's'}
            </CardTitle>
          </CardHeader>
          <CardContent className={'flex flex-col gap-4'}>
            <div className={'flex flex-col gap-2'}>
              <Label>Target folder</Label>
              <Select value={targetFolderId} onValueChange={setTargetFolderId}>
                <SelectTrigger>
                  <SelectValue placeholder={'Select a folder'} />
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

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.original_path}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[item.status]}>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className={'text-destructive text-xs'}>
                      {item.error ?? ''}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className={'flex items-center gap-3'}>
              <Button
                type={'button'}
                variant={'outline'}
                onClick={onExpand}
                disabled={isExpanding || !targetFolderId}
              >
                {isExpanding ? <Spinner /> : null}
                {isExpanding ? 'Importing' : 'Confirm and import'}
              </Button>
              {expansion ? (
                <span className={'text-muted-foreground text-sm'}>
                  {expansion.imported} imported · {expansion.failed} failed
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
