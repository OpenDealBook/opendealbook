import type { ReactNode } from 'react';

import { Button } from '@odb/ui/button';

import {
  type SignatureStatus,
  documensoLinkWording,
  signatureInProgress,
  signatureStatusWording,
} from './signature-wording';

export function SignatureState({
  status,
  editorUrl,
  checkLabel,
  isPending,
  onCheck,
  children,
}: {
  status: SignatureStatus;
  editorUrl: string | null;
  checkLabel: string;
  isPending: boolean;
  onCheck: () => void;
  children?: ReactNode;
}) {
  return (
    <>
      <span className={'text-sm'}>
        {children}
        <span className={'font-medium'}>{signatureStatusWording[status]}</span>
      </span>
      {editorUrl ? (
        <a
          href={editorUrl}
          target={'_blank'}
          rel={'noreferrer'}
          className={'text-primary w-fit text-sm font-medium underline'}
        >
          {documensoLinkWording}
        </a>
      ) : null}
      {signatureInProgress(status) ? (
        <Button
          size={'sm'}
          variant={'outline'}
          className={'w-fit'}
          disabled={isPending}
          aria-label={checkLabel}
          onClick={onCheck}
        >
          Check status
        </Button>
      ) : null}
    </>
  );
}
