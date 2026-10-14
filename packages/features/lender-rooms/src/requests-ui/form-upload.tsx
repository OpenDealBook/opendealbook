'use client';

import { useState } from 'react';

import { FileUpIcon } from 'lucide-react';

import type { Enums } from '@odb/supabase';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import { Textarea } from '@odb/ui/textarea';

import { openForm } from '../forms/lender-actions';
import { AttemptDialog, AttemptForm } from './attempt-dialog';
import { ReturnRouteChoice, offeredRoute } from './return-route-choice';
import { SingleFilePicker } from './single-file-picker';
import { hasUsableUpload, sendBlocker } from './upload-queue';
import { useUploads } from './uploads';
import { teamName, teamNameAtStart } from './wording';

interface FormUploadProps {
  roomId: string;
  privateFolderId: string;
  dealName: string | null;
  esignAvailable: boolean;
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
  const fileName = uploads.queue[0]?.name ?? '';

  return (
    <AttemptForm
      confirmLabel={'Send form'}
      blocker={sendBlocker(uploads.queue)}
      canConfirm={hasUsableUpload(uploads.queue)}
      hasUnsentFiles={uploads.queue.length > 0}
      action={async (fields) => {
        const files = await uploads.registerHeldUploads(true);
        const note = String(fields.get('note'));

        return files.ok
          ? openForm({
              roomId,
              title: String(fields.get('title')),
              ...(note ? { note } : {}),
              documentId: files.value[0]!,
              returnRoute: offeredRoute(fileName, chosenRoute, esignAvailable),
            })
          : files;
      }}
    >
      <SingleFilePicker uploads={uploads} chooseLabel={'Choose the form'} />

      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'form-title'}>Title</Label>
        <Input id={'form-title'} name={'title'} required />
      </div>

      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'form-note'}>Note (optional)</Label>
        <Textarea id={'form-note'} name={'note'} />
      </div>

      {esignAvailable ? (
        <ReturnRouteChoice
          fileName={fileName}
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
