'use client';

import { useState } from 'react';

import { FileUpIcon } from 'lucide-react';

import type { Enums } from '@odb/supabase';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import { Textarea } from '@odb/ui/textarea';
import { cn } from '@odb/ui/utils';

import type { ActionResult } from '../actions/refusal';
import { openForm, sentFormTitle } from '../forms/lender-actions';
import { allowedReturnRoutes } from '../forms/return-routes';
import { useSendingRequests } from './ask-composer';
import { AttemptDialog, AttemptForm } from './attempt-dialog';
import { LiveRegion } from './refusal-note';
import { ReturnRouteChoice, offeredRoute } from './return-route-choice';
import { hasUsableUpload, sendBlocker } from './upload-queue';
import { AttachButton, UploadList, useFileDrop, useUploads } from './uploads';
import { teamName, teamNameAtStart } from './wording';

interface FormUploadProps {
  roomId: string;
  privateFolderId: string;
  dealName: string | null;
  esignAvailable: boolean;
}

function withoutExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}

function FormUploadFields({
  roomId,
  privateFolderId,
  dealName,
  esignAvailable,
}: FormUploadProps) {
  const [chosenRoute, setChosenRoute] =
    useState<Enums<'lender_return_route'>>('upload');
  const uploads = useUploads({
    space: { roomId },
    folderId: privateFolderId,
    registerWhen: 'when-sent',
  });
  const drop = useFileDrop(add);
  const track = useSendingRequests();
  const [typedTitles, setTypedTitles] = useState<Record<string, string>>({});
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [checkedKeys, setCheckedKeys] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const forms = uploads.queue.filter(
    (upload) =>
      upload.state.kind === 'held' || upload.state.kind === 'attached',
  );

  function add(files: File[]) {
    const started = uploads.pick(files);

    setSizes((now) => ({
      ...now,
      ...Object.fromEntries(started.map(({ key, file }) => [key, file.size])),
    }));
  }

  function titleOf(upload: { key: string; name: string }): string {
    return typedTitles[upload.key] ?? withoutExtension(upload.name);
  }

  async function sentBefore(): Promise<ActionResult<string[]>> {
    const sentAs: string[] = [];

    for (const upload of forms.filter(({ key }) => !checkedKeys.has(key))) {
      const title = await sentFormTitle({
        roomId,
        name: upload.name,
        size: sizes[upload.key]!,
      });

      if (!title.ok) {
        return title;
      }

      if (title.value) {
        sentAs.push(`${upload.name} as "${title.value}"`);
      }
    }

    setCheckedKeys(new Set(forms.map(({ key }) => key)));

    return { ok: true, value: sentAs };
  }

  return (
    <AttemptForm
      confirmLabel={'Send form'}
      blocker={sendBlocker(uploads.queue)}
      canConfirm={hasUsableUpload(uploads.queue)}
      hasUnsentFiles={uploads.queue.length > 0}
      action={async (fields) => {
        const sentAs = await sentBefore();

        if (!sentAs.ok) {
          return sentAs;
        }

        if (sentAs.value.length > 0) {
          return {
            ok: false,
            refusal: `You already sent ${sentAs.value.join(', ')}. Send form again to send it anyway.`,
          };
        }

        const files = await uploads.registerHeldUploads(true);

        if (!files.ok) {
          return files;
        }

        const note = String(fields.get('note'));

        for (const [index, upload] of forms.entries()) {
          const sent = await track('form', titleOf(upload), () =>
            openForm({
              roomId,
              title: titleOf(upload),
              ...(note ? { note } : {}),
              documentId: files.value[index]!,
              returnRoute: offeredRoute(
                upload.name,
                chosenRoute,
                esignAvailable,
              ),
            }),
          );

          if (!sent.ok) {
            return sent;
          }

          uploads.remove(upload.key);
        }

        return { ok: true, value: null };
      }}
    >
      <div
        {...drop.dropProps}
        className={cn(
          'flex flex-col gap-2 rounded-lg border border-dashed p-3',
          drop.isOver && 'border-ring bg-secondary',
        )}
      >
        <div className={'flex flex-wrap items-center gap-x-2'}>
          <AttachButton onPick={add} multiple>
            Choose the forms
          </AttachButton>
          <span className={'text-muted-foreground text-sm'}>
            or drop them here
          </span>
        </div>
        <UploadList
          queue={uploads.queue}
          onRemove={uploads.remove}
          onRetry={uploads.retry}
        />
        <LiveRegion message={uploads.announcement} />
      </div>

      {(forms.length === 0 ? [{ key: '', name: '' }] : forms).map((upload) => (
        <div key={upload.key} className={'flex flex-col gap-2'}>
          <Label htmlFor={`form-title-${upload.key}`}>
            {forms.length > 1 ? `Title for ${upload.name}` : 'Title'}
          </Label>
          <Input
            id={`form-title-${upload.key}`}
            required
            value={titleOf(upload)}
            onChange={(event) =>
              setTypedTitles((now) => ({
                ...now,
                [upload.key]: event.target.value,
              }))
            }
          />
        </div>
      ))}

      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'form-note'}>Note (optional)</Label>
        <Textarea id={'form-note'} name={'note'} />
      </div>

      {esignAvailable ? (
        <ReturnRouteChoice
          fileName={
            (
              forms.find((upload) =>
                allowedReturnRoutes(upload.name).includes('esign'),
              ) ?? forms[0]
            )?.name ?? ''
          }
          screen={'upload'}
          dealName={dealName}
          chosen={chosenRoute}
          onChoose={setChosenRoute}
        />
      ) : null}
    </AttemptForm>
  );
}

export function FormUpload(props: FormUploadProps) {
  return (
    <AttemptDialog
      openLabel={'Upload a form'}
      openIcon={<FileUpIcon />}
      title={`Upload a form for ${teamName(props.dealName)} to complete`}
      description={
        props.esignAvailable
          ? `Send your own form and choose how ${teamName(props.dealName)} returns it.`
          : `Send your own form. ${teamNameAtStart(props.dealName)} fills it in and uploads the completed file to this room.`
      }
      discardWording={'Discard this request?'}
    >
      <FormUploadFields {...props} />
    </AttemptDialog>
  );
}
