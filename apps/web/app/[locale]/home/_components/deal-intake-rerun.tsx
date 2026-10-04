'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { rerunDealIntake, rerunDealIntakePdf } from '@odb/deals/server';
import { Button } from '@odb/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@odb/ui/dialog';
import { Input } from '@odb/ui/input';
import { Textarea } from '@odb/ui/textarea';

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function DealIntakeRerun({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [pdf, setPdf] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onRerun() {
    setError(null);
    startTransition(async () => {
      try {
        await rerunDealIntake({ deal_id: dealId, text });
        setOpen(false);
        setText('');
        router.refresh();
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : 'Could not re-extract',
        );
      }
    });
  }

  function onRerunPdf() {
    if (pdf === null) return;

    setError(null);
    startTransition(async () => {
      try {
        await rerunDealIntakePdf({ deal_id: dealId, pdf: await fileToBase64(pdf) });
        setOpen(false);
        setPdf(null);
        router.refresh();
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : 'Could not re-extract',
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={'outline'} size={'sm'}>
          Re-extract with AI
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Re-extract this deal</DialogTitle>
        </DialogHeader>
        <Textarea
          value={text}
          placeholder={'Paste the updated listing or memo text'}
          onChange={(event) => setText(event.target.value)}
        />
        <Input
          type={'file'}
          accept={'.pdf'}
          onChange={(event) => setPdf(event.target.files?.[0] ?? null)}
        />
        {error !== null ? (
          <p className={'text-destructive text-sm'}>{error}</p>
        ) : null}
        <DialogFooter>
          <Button variant={'outline'} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={pending || pdf === null} onClick={onRerunPdf}>
            {pending ? 'Extracting...' : 'Re-extract from PDF'}
          </Button>
          <Button disabled={pending || text.trim() === ''} onClick={onRerun}>
            {pending ? 'Extracting...' : 'Re-extract'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
