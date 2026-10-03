'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { rerunDealIntake } from '@odb/deals/server';
import { Button } from '@odb/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@odb/ui/dialog';
import { Textarea } from '@odb/ui/textarea';

export function DealIntakeRerun({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
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
        {error !== null ? (
          <p className={'text-destructive text-sm'}>{error}</p>
        ) : null}
        <DialogFooter>
          <Button variant={'outline'} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={pending || text.trim() === ''} onClick={onRerun}>
            {pending ? 'Extracting...' : 'Re-extract'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
