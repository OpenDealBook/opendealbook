'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import {
  cancelFormSignature,
  checkFormSignature,
  requestFormSignature,
} from '@odb/lender-rooms/esign/actions.ts';
import { LocalTime } from '@odb/lender-rooms/requests-ui/local-time.tsx';
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

import { teamSignInPath } from './lender-wording';
import { SignatureState } from './signature-state';
import { type SignatureStatus, signatureInProgress } from './signature-wording';
import { SignerInputs, oneBlankSigner } from './signer-inputs';

export interface FormSignature {
  id: string;
  status: SignatureStatus;
  created_at: string;
  signer_names: string[] | null;
  editor_url: string | null;
}

export function LenderFormSignature({
  formId,
  signatures,
}: {
  formId: string;
  signatures: FormSignature[];
}) {
  const router = useRouter();
  const { problem, isPending, attempt } = useAttempt();
  const [signers, setSigners] = useState(oneBlankSigner);
  const [isCancelling, setIsCancelling] = useState(false);

  const history = signatures.toSorted((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  const [newest] = history;
  const newestStatus = newest?.status ?? null;

  return (
    <section className={'bg-card flex flex-col gap-4 rounded-lg border p-4'}>
      <div className={'flex flex-col gap-1'}>
        <h2 className={'font-medium'}>Signature</h2>
        <p className={'text-muted-foreground text-sm'}>
          The lender wants this form signed electronically. Requesting a
          signature creates a draft in Documenso; you place the signature fields
          there and it goes out to the signers from Documenso.
        </p>
      </div>

      {history.map((signature) => (
        <div key={signature.id} className={'flex flex-col gap-2'}>
          <SignatureState
            status={signature.status}
            editorUrl={signature.editor_url}
            checkLabel={'Check status'}
            isPending={isPending}
            onCheck={() =>
              attempt(
                () => checkFormSignature({ signatureId: signature.id }),
                () => router.refresh(),
              )
            }
          >
            <span className={'text-muted-foreground'}>
              {signature.signer_names?.join(', ')}
              {signature.signer_names ? ', ' : null}
              requested <LocalTime at={signature.created_at} />:{' '}
            </span>
          </SignatureState>
        </div>
      ))}

      {newest?.status === 'draft' ? (
        <>
          <Button
            size={'sm'}
            variant={'ghost'}
            className={'w-fit'}
            disabled={isPending}
            onClick={() => setIsCancelling(true)}
          >
            Cancel signature request
          </Button>
          <Dialog open={isCancelling} onOpenChange={setIsCancelling}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cancel this signature request?</DialogTitle>
                <DialogDescription>
                  Nobody will be asked to sign this draft. You can request a
                  signature again afterwards.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant={'outline'}
                  onClick={() => setIsCancelling(false)}
                >
                  Keep request
                </Button>
                <Button
                  variant={'destructive'}
                  onClick={() => {
                    setIsCancelling(false);
                    attempt(
                      () => cancelFormSignature({ signatureId: newest.id }),
                      () => router.refresh(),
                    );
                  }}
                >
                  Yes, cancel it
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}

      {signatureInProgress(newestStatus) ||
      newestStatus === 'completed' ? null : (
        <form
          className={'flex flex-col gap-3'}
          onSubmit={(event) => {
            event.preventDefault();
            attempt(
              () => requestFormSignature({ formId, signers }),
              () => {
                setSigners(oneBlankSigner);
                router.refresh();
              },
            );
          }}
        >
          <h3 className={'text-sm font-medium'}>Who signs</h3>
          <SignerInputs signers={signers} onChange={setSigners} />
          <Button type={'submit'} className={'w-fit'} disabled={isPending}>
            Request signature
          </Button>
        </form>
      )}

      <ProblemNote problem={problem} signInPath={teamSignInPath} />
    </section>
  );
}
