'use client';

import { type ReactNode, useState } from 'react';

import type { ActionResult } from '@odb/lender-rooms/actions/refusal.ts';
import { ProblemNote } from '@odb/lender-rooms/requests-ui/refusal-note.tsx';
import { useAttempt } from '@odb/lender-rooms/requests-ui/use-attempt.ts';
import { Button } from '@odb/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@odb/ui/dialog';

import { teamSignInPath } from '../lender-wording';

export function ConfirmButton({
  children,
  label,
  title,
  description,
  confirmLabel,
  variant = 'ghost',
  action,
  onDone,
}: {
  children: ReactNode;
  label?: string;
  title: string;
  description: string;
  confirmLabel: string;
  variant?: 'ghost' | 'outline';
  action: () => Promise<ActionResult<unknown>>;
  onDone: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const confirming = useAttempt();

  return (
    <>
      <Button
        type={'button'}
        variant={variant}
        size={variant === 'ghost' ? 'sm' : 'default'}
        aria-label={label}
        onClick={() => setIsOpen(true)}
      >
        {children}
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <ProblemNote
            problem={confirming.problem}
            signInPath={teamSignInPath}
          />
          <DialogFooter>
            <Button
              type={'button'}
              variant={'outline'}
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type={'button'}
              variant={'destructive'}
              disabled={confirming.isPending}
              onClick={() =>
                confirming.attempt(action, () => {
                  setIsOpen(false);
                  onDone();
                })
              }
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
