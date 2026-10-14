'use client';

import { type ReactNode, useState } from 'react';

import { useRouter } from 'next/navigation';

import { Button } from '@odb/ui/button';
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@odb/ui/dialog';

import type { ActionResult } from '../actions/refusal';
import { GuardedDialog, useGuardedDialog, useUnsentWork } from './discard';
import { ProblemNote } from './refusal-note';
import { useAttempt } from './use-attempt';

export function AttemptDialog({
  openLabel,
  openIcon,
  title,
  description,
  discardWording = 'Discard your changes?',
  focusAfterSending,
  children,
}: {
  openLabel: string;
  openIcon?: ReactNode;
  title: string;
  description?: string;
  discardWording?: string;
  focusAfterSending?: () => void;
  children: ReactNode;
}) {
  return (
    <GuardedDialog
      trigger={
        <Button variant={'outline'} size={'sm'}>
          {openIcon}
          {openLabel}
        </Button>
      }
      discardWording={discardWording}
      focusAfterSending={focusAfterSending}
      className={'max-h-[90dvh] overflow-y-auto'}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description ? (
          <DialogDescription>{description}</DialogDescription>
        ) : null}
      </DialogHeader>
      {children}
    </GuardedDialog>
  );
}

export function AttemptForm({
  confirmLabel,
  blocker = null,
  canConfirm = true,
  hasUnsentFiles = false,
  action,
  children,
}: {
  confirmLabel: string;
  blocker?: string | null;
  canConfirm?: boolean;
  hasUnsentFiles?: boolean;
  action: (fields: FormData) => Promise<ActionResult<unknown>>;
  children?: ReactNode;
}) {
  const router = useRouter();
  const dialog = useGuardedDialog();
  const [isTouched, setIsTouched] = useState(false);
  const { problem, isPending, attempt } = useAttempt();

  useUnsentWork(isTouched || hasUnsentFiles);

  return (
    <form
      className={'flex flex-col gap-4'}
      onInput={() => setIsTouched(true)}
      onSubmit={(event) => {
        event.preventDefault();

        const fields = new FormData(event.currentTarget);

        attempt(
          () => action(fields),
          () => {
            dialog.closeAfterSending();
            router.refresh();
          },
        );
      }}
    >
      {children}
      {blocker ? <p className={'text-sm'}>{blocker}</p> : null}
      <ProblemNote problem={problem} />
      <DialogFooter>
        <Button
          type={'button'}
          variant={'outline'}
          onClick={dialog.requestClose}
        >
          Cancel
        </Button>
        <Button
          type={'submit'}
          disabled={isPending || !canConfirm || blocker !== null}
        >
          {confirmLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
