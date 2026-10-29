'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { resolveUnknownSend } from '@odb/outreach-app/server';
import { Button } from '@odb/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@odb/ui/dialog';

type Resolution = 'mark_sent' | 'retry' | 'stop';

const CONFIRMATIONS = {
  retry: {
    title: 'Send this email again?',
    description:
      "If the first send went through, this person gets the email twice. Check the mailbox's sent folder first.",
    confirm: 'Send again',
  },
  stop: {
    title: 'Stop this sequence?',
    description:
      'No more emails in this sequence go to this person. The enrollment shows as failed.',
    confirm: 'Stop sequence',
  },
};

export function UnknownSendActions({
  enrollmentId,
  canResolve,
}: {
  enrollmentId: string;
  canResolve: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<keyof typeof CONFIRMATIONS | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function resolve(resolution: Resolution) {
    startTransition(async () => {
      const result = await resolveUnknownSend({ enrollmentId, resolution });

      setConfirming(null);
      if (!result.ok) {
        setRefusal(result.refusal);
        return;
      }
      setRefusal(null);
      router.refresh();
    });
  }

  return (
    <div className={'flex flex-col gap-2'}>
      <p className={'text-sm'}>
        We couldn&apos;t tell whether this email went out. Check the mailbox&apos;s sent folder.
      </p>
      {canResolve ? (
        <div className={'flex flex-wrap gap-2'}>
          <Button
            type={'button'}
            size={'sm'}
            variant={'outline'}
            disabled={pending}
            onClick={() => resolve('mark_sent')}
          >
            Mark as sent
          </Button>
          <Button
            type={'button'}
            size={'sm'}
            variant={'outline'}
            disabled={pending}
            onClick={() => setConfirming('retry')}
          >
            Retry
          </Button>
          <Button
            type={'button'}
            size={'sm'}
            variant={'outline'}
            disabled={pending}
            onClick={() => setConfirming('stop')}
          >
            Stop
          </Button>
        </div>
      ) : null}
      {refusal ? (
        <p role={'alert'} className={'text-destructive text-sm'}>
          {refusal}
        </p>
      ) : null}
      <Dialog open={confirming !== null} onOpenChange={() => setConfirming(null)}>
        {confirming ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{CONFIRMATIONS[confirming].title}</DialogTitle>
              <DialogDescription>{CONFIRMATIONS[confirming].description}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type={'button'}
                variant={'outline'}
                disabled={pending}
                onClick={() => setConfirming(null)}
              >
                Cancel
              </Button>
              <Button type={'button'} disabled={pending} onClick={() => resolve(confirming)}>
                {CONFIRMATIONS[confirming].confirm}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
