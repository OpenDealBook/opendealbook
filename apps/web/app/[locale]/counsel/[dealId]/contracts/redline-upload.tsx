'use client';

import { type FormEvent, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { uploadCounselRedline } from '@odb/contracts/server';
import { AttachButton } from '@odb/lender-rooms/requests-ui/uploads.tsx';
import { Button } from '@odb/ui/button';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';

export function RedlineUpload({
  dealId,
  contractId,
}: {
  dealId: string;
  contractId: string;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  const [isUploading, startUploading] = useTransition();
  const summaryId = `redline-summary-${contractId}`;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    startUploading(async () => {
      const result = await uploadCounselRedline({
        dealId,
        contractId,
        docxBytes: new Uint8Array(await file!.arrayBuffer()),
        changeSummary: summary || undefined,
      });

      setRefusal(result.ok ? null : result.refusal);

      if (result.ok) {
        router.refresh();
      }
    });
  }

  return (
    <form className={'flex flex-col gap-2'} onSubmit={onSubmit}>
      <div className={'flex flex-wrap items-center gap-2'}>
        <AttachButton
          onPick={(files) => setFile(files[0]!)}
          multiple={false}
          accept={'.docx'}
        >
          Choose redline (.docx)
        </AttachButton>
        {file ? (
          <span className={'text-muted-foreground text-sm'}>{file.name}</span>
        ) : null}
      </div>
      <Label htmlFor={summaryId}>What changed (optional)</Label>
      <Input
        id={summaryId}
        value={summary}
        onChange={(event) => setSummary(event.target.value)}
      />
      <div className={'flex items-center gap-2'}>
        <Button type={'submit'} size={'sm'} disabled={!file || isUploading}>
          Upload redline
        </Button>
        {refusal ? (
          <span role={'alert'} className={'text-destructive text-sm'}>
            {refusal}
          </span>
        ) : null}
      </div>
    </form>
  );
}
