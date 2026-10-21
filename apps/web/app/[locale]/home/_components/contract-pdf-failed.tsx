'use client';

import { retryContractVersionPdf } from '@odb/contracts/server';
import { Button } from '@odb/ui/button';

import { useRefusableAction } from './use-refusable-action';

export function ContractPdfFailed({
  contractVersionId,
  canRetry,
}: {
  contractVersionId: string;
  canRetry: boolean;
}) {
  const { refusal, pending, run } = useRefusableAction();

  return (
    <>
      <span className={'text-destructive'}>PDF conversion failed</span>
      {canRetry ? (
        <Button
          type={'button'}
          variant={'outline'}
          size={'sm'}
          disabled={pending}
          onClick={() =>
            run(() => retryContractVersionPdf({ contractVersionId }))
          }
        >
          Retry PDF
        </Button>
      ) : null}
      {refusal ? (
        <p role={'alert'} className={'text-destructive text-sm'}>
          {refusal}
        </p>
      ) : null}
    </>
  );
}
