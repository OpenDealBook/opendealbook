'use client';

import { type ReactNode, useState } from 'react';

import { useRouter } from 'next/navigation';

import {
  createLoiExtensionFromTemplate,
  createNotedLoiExtension,
  noteLoiExtension,
  recordLoiExtensionSignedElsewhere,
  rescheduleLoiExtension,
} from '@odb/deals/server';
import { ProblemNote } from '@odb/lender-rooms/requests-ui/refusal-note.tsx';
import { useAttempt } from '@odb/lender-rooms/requests-ui/use-attempt.ts';
import type { ActionResult } from '@odb/next/refusal';
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
import { Textarea } from '@odb/ui/textarea';

import { SignedCopyFields, signedCopyFrom } from './record-signed-contract';

const WAYS = {
  template: 'Generate from the template',
  upload: 'Upload the signed copy',
  note: 'Note as agreed by email',
};

type Way = keyof typeof WAYS;

function ActionDialog({
  label,
  primary = false,
  ready = true,
  onClose = () => {},
  submit,
  children,
}: {
  label: string;
  primary?: boolean;
  ready?: boolean;
  onClose?: () => void;
  submit: (form: FormData) => Promise<ActionResult<unknown>>;
  children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function changeOpen(next: boolean) {
    setOpen(next);

    if (!next) {
      onClose();
    }
  }
  const saving = useAttempt();

  return (
    <>
      <Button
        size={'sm'}
        variant={primary ? 'default' : 'outline'}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>
          <form
            className={'flex flex-col gap-4'}
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);

              saving.attempt(
                () => submit(form),
                () => {
                  changeOpen(false);
                  router.refresh();
                },
              );
            }}
          >
            {children}
            <ProblemNote
              problem={saving.problem}
              signInPath={'/auth/sign-in'}
            />
            <DialogFooter>
              <Button
                type={'button'}
                variant={'outline'}
                onClick={() => changeOpen(false)}
                disabled={saving.isPending}
              >
                Cancel
              </Button>
              <Button type={'submit'} disabled={saving.isPending || !ready}>
                {label}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EndDateField({ defaultValue }: { defaultValue?: string }) {
  return (
    <Label className={'flex flex-col items-start gap-2'}>
      New end date
      <Input
        name={'extends_to'}
        type={'date'}
        defaultValue={defaultValue}
        required
      />
    </Label>
  );
}

function AgreementFields() {
  return (
    <>
      <Label className={'flex flex-col items-start gap-2'}>
        What was agreed
        <Textarea name={'note'} required />
      </Label>
      <Label className={'flex flex-col items-start gap-2'}>
        Agreed on
        <Input name={'noted_on'} type={'date'} required />
      </Label>
    </>
  );
}

function agreementFrom(form: FormData) {
  return {
    note: form.get('note') as string,
    noted_on: form.get('noted_on') as string,
  };
}

export function ExtendExclusivity({
  dealId,
  loiId,
}: {
  dealId: string;
  loiId: string;
}) {
  const [way, setWay] = useState<Way | null>(null);
  const [file, setFile] = useState<File | null>(null);

  return (
    <ActionDialog
      label={'Extend exclusivity'}
      primary
      ready={way !== 'upload' || file !== null}
      onClose={() => {
        setWay(null);
        setFile(null);
      }}
      submit={(form) => {
        const extension = {
          deal_id: dealId,
          loi_id: loiId,
          extends_to: form.get('extends_to') as string,
        };

        if (way === 'template') {
          return createLoiExtensionFromTemplate(extension);
        }

        return way === 'upload'
          ? recordLoiExtensionSignedElsewhere({
              ...extension,
              ...signedCopyFrom(form, file!),
            })
          : createNotedLoiExtension({ ...extension, ...agreementFrom(form) });
      }}
    >
      <p className={'text-muted-foreground text-sm'}>
        The extension moves the end of exclusivity once it is signed or noted.
      </p>
      <EndDateField />
      <fieldset className={'flex flex-col gap-2'}>
        <legend className={'mb-2 text-sm font-medium'}>How it is agreed</legend>
        {(Object.keys(WAYS) as Way[]).map((each) => (
          <Label key={each} className={'flex items-center gap-2'}>
            <input
              type={'radio'}
              name={'way'}
              value={each}
              required
              onChange={() => setWay(each)}
            />
            {WAYS[each]}
          </Label>
        ))}
      </fieldset>
      {way === 'upload' ? <SignedCopyFields onFile={setFile} /> : null}
      {way === 'note' ? <AgreementFields /> : null}
    </ActionDialog>
  );
}

export function ChangeExtensionEndDate({
  dealId,
  extensionId,
  extendsTo,
}: {
  dealId: string;
  extensionId: string;
  extendsTo: string;
}) {
  return (
    <ActionDialog
      label={'Change end date'}
      submit={(form) =>
        rescheduleLoiExtension({
          deal_id: dealId,
          extension_id: extensionId,
          extends_to: form.get('extends_to') as string,
        })
      }
    >
      <EndDateField defaultValue={extendsTo} />
    </ActionDialog>
  );
}

export function NoteLoiExtension({
  dealId,
  extensionId,
}: {
  dealId: string;
  extensionId: string;
}) {
  return (
    <ActionDialog
      label={'Note as agreed'}
      submit={(form) =>
        noteLoiExtension({
          deal_id: dealId,
          extension_id: extensionId,
          ...agreementFrom(form),
        })
      }
    >
      <p className={'text-muted-foreground text-sm'}>
        For an extension agreed by email with no signed document. Noting it
        moves the end of exclusivity and fixes its end date.
      </p>
      <AgreementFields />
    </ActionDialog>
  );
}
