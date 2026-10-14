'use client';

import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useRouter } from 'next/navigation';

import { Button } from '@odb/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@odb/ui/dialog';

import { interceptsLink } from './leave-guard';

function DiscardPrompt({
  isOpen,
  wording,
  onKeep,
  onDiscard,
}: {
  isOpen: boolean;
  wording: string;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <Dialog open={isOpen} onOpenChange={onKeep}>
      <DialogContent showCloseButton={false} className={'sm:max-w-sm'}>
        <DialogHeader>
          <DialogTitle>{wording}</DialogTitle>
          <DialogDescription>
            What you typed and any files waiting to be sent will be removed.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant={'outline'} onClick={onKeep}>
            Keep editing
          </Button>
          <Button variant={'destructive'} onClick={onDiscard}>
            Discard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface Guard {
  setIsUnsent: (isUnsent: boolean) => void;
  requestClose: () => void;
  closeAfterSending: () => void;
}

const GuardContext = createContext<Guard | null>(null);

export function useGuardedDialog(): Guard {
  return useContext(GuardContext)!;
}

export type OpenedBy =
  | { trigger: ReactNode; open?: undefined; onOpenChange?: undefined }
  | {
      trigger?: undefined;
      open: boolean;
      onOpenChange: (isOpen: boolean) => void;
    };

export function GuardedDialog({
  trigger,
  open,
  onOpenChange,
  discardWording,
  focusAfterSending,
  className,
  children,
}: OpenedBy & {
  discardWording: string;
  focusAfterSending?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const [isOpenByTrigger, setIsOpenByTrigger] = useState(false);
  const isOpen = open ?? isOpenByTrigger;
  const setIsOpen = onOpenChange ?? setIsOpenByTrigger;
  const [isUnsent, setIsUnsent] = useState(false);
  const [isDiscardPromptOpen, setIsDiscardPromptOpen] = useState(false);
  const closedBySending = useRef(false);

  function requestClose() {
    if (isUnsent) {
      setIsDiscardPromptOpen(true);
    } else {
      setIsOpen(false);
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(opens) => {
        if (opens) {
          closedBySending.current = false;
          setIsOpen(true);
        } else {
          requestClose();
        }
      }}
    >
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent
        showCloseButton={false}
        className={className}
        onCloseAutoFocus={(event) => {
          if (closedBySending.current && focusAfterSending) {
            event.preventDefault();
            focusAfterSending();
          }
        }}
      >
        <GuardContext
          value={{
            setIsUnsent,
            requestClose,
            closeAfterSending() {
              closedBySending.current = true;
              setIsOpen(false);
            },
          }}
        >
          {children}
        </GuardContext>
        <DiscardPrompt
          isOpen={isDiscardPromptOpen}
          wording={discardWording}
          onKeep={() => setIsDiscardPromptOpen(false)}
          onDiscard={() => {
            setIsDiscardPromptOpen(false);
            setIsOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function useUnsentWork(isUnsent: boolean) {
  const reportToDialog = useContext(GuardContext)?.setIsUnsent;

  useEffect(() => {
    reportToDialog?.(isUnsent);

    return () => reportToDialog?.(false);
  }, [reportToDialog, isUnsent]);

  useEffect(() => {
    if (!isUnsent) {
      return;
    }

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    window.addEventListener('beforeunload', warnBeforeUnload);

    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isUnsent]);
}

export function LeavePrompt({
  isUnsent,
  wording,
}: {
  isUnsent: boolean;
  wording: string;
}) {
  const isInDialog = useContext(GuardContext) !== null;
  const router = useRouter();
  const [leavingFor, setLeavingFor] = useState<string | null>(null);

  useEffect(() => {
    if (!isUnsent || isInDialog) {
      return;
    }

    function askBeforeFollowing(event: MouseEvent) {
      const anchor =
        event.target instanceof Element ? event.target.closest('a') : null;

      if (
        anchor &&
        interceptsLink(
          {
            href: anchor.href,
            target: anchor.target,
            isDownload: anchor.hasAttribute('download'),
            withModifier:
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey,
          },
          window.location.href,
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
        setLeavingFor(anchor.href);
      }
    }

    document.addEventListener('click', askBeforeFollowing, true);

    return () =>
      document.removeEventListener('click', askBeforeFollowing, true);
  }, [isUnsent, isInDialog]);

  return (
    <DiscardPrompt
      isOpen={leavingFor !== null}
      wording={wording}
      onKeep={() => setLeavingFor(null)}
      onDiscard={() => {
        router.push(leavingFor!);
        setLeavingFor(null);
      }}
    />
  );
}
