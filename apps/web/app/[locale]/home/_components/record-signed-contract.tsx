'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import {
  recordContractSignedElsewhere,
  recordSignedCopyOfLoiExtension,
} from '@odb/deals/server';
import { ProblemNote } from '@odb/lender-rooms/requests-ui/refusal-note.tsx';
import { useAttempt } from '@odb/lender-rooms/requests-ui/use-attempt.ts';
import { Button } from '@odb/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@odb/ui/dialog';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';

const TYPE_LABEL = { loi: 'LOI', apa: 'APA', loi_extension: 'LOI extension' };

type Target =
  | { type: 'loi' | 'apa'; contractId: string | null }
  | { type: 'loi_extension'; contractId: string };

export function signedCopyFrom(form: FormData, file: File) {
  return {
    party: form.get('party') as 'buyer' | 'seller',
    signed_on: form.get('signed_on') as string,
    file,
  };
}

export function SignedCopyFields({
  onFile,
}: {
  onFile: (file: File | null) => void;
}) {
  return (
    <>
      <Label className={'flex flex-col items-start gap-2'}>
        Signed copy
        <Input
          type={'file'}
          accept={'.pdf,.docx'}
          onChange={(event) => onFile(event.target.files?.[0] ?? null)}
        />
      </Label>
      <Label className={'flex flex-col items-start gap-2'}>
        Signing date
        <Input name={'signed_on'} type={'date'} required />
      </Label>
      <fieldset className={'flex gap-4'}>
        <legend className={'text-sm font-medium'}>Version from</legend>
        {(['buyer', 'seller'] as const).map((party) => (
          <Label key={party} className={'flex items-center gap-2'}>
            <input type={'radio'} name={'party'} value={party} required />
            {party === 'buyer' ? 'Buyer' : 'Seller'}
          </Label>
        ))}
      </fieldset>
    </>
  );
}

function record(
  dealId: string,
  target: Target,
  copy: ReturnType<typeof signedCopyFrom>,
) {
  return target.type === 'loi_extension'
    ? recordSignedCopyOfLoiExtension({
        deal_id: dealId,
        extension_id: target.contractId,
        ...copy,
      })
    : recordContractSignedElsewhere({
        deal_id: dealId,
        type: target.type,
        contract_id: target.contractId,
        ...copy,
      });
}

export function RecordSignedContract({
  dealId,
  ...target
}: { dealId: string } & Target) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const recording = useAttempt();
  const wording = `Record signed ${TYPE_LABEL[target.type]}`;

  return (
    <>
      <Button size={'sm'} variant={'outline'} onClick={() => setOpen(true)}>
        {wording}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{wording}</DialogTitle>
          </DialogHeader>
          <form
            className={'flex flex-col gap-4'}
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);

              recording.attempt(
                () => record(dealId, target, signedCopyFrom(form, file!)),
                () => {
                  setOpen(false);
                  router.refresh();
                },
              );
            }}
          >
            <p className={'text-muted-foreground text-sm'}>
              For a {TYPE_LABEL[target.type]} signed outside Documenso. It is
              recorded exactly as a completed Documenso signature would be.
            </p>
            <SignedCopyFields onFile={setFile} />
            <ProblemNote
              problem={recording.problem}
              signInPath={'/auth/sign-in'}
            />
            <DialogFooter>
              <Button
                type={'button'}
                variant={'outline'}
                onClick={() => setOpen(false)}
                disabled={recording.isPending}
              >
                Cancel
              </Button>
              <Button
                type={'submit'}
                disabled={recording.isPending || file === null}
              >
                {wording}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
