'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import {
  setMyCounselDetails,
  skipCounselProfilePrompt,
} from '@odb/deal-counsel/profile.ts';
import { Button } from '@odb/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@odb/ui/dialog';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';

interface Details {
  dealId: string;
  name: string | null;
  phone: string | null;
}

export function CounselDetailsForm({ dealId, name, phone }: Details) {
  const router = useRouter();
  const [refusal, setRefusal] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSaving, startSaving] = useTransition();

  return (
    <form
      className={'flex flex-col gap-2'}
      action={(formData) =>
        startSaving(async () => {
          const result = await setMyCounselDetails({
            dealId,
            name: String(formData.get('name')),
            phone: String(formData.get('phone')),
          });

          setSaved(result.ok);
          setRefusal(result.ok ? null : result.refusal);

          if (result.ok) {
            router.refresh();
          }
        })
      }
    >
      <Label htmlFor={'counsel-name'}>Your name</Label>
      <Input
        id={'counsel-name'}
        name={'name'}
        defaultValue={name ?? ''}
        autoComplete={'name'}
        maxLength={200}
        required
      />
      <Label htmlFor={'counsel-phone'}>Phone (optional)</Label>
      <Input
        id={'counsel-phone'}
        name={'phone'}
        type={'tel'}
        defaultValue={phone ?? ''}
        autoComplete={'tel'}
        maxLength={50}
      />
      <div className={'flex items-center gap-3'}>
        <Button type={'submit'} disabled={isSaving}>
          Save
        </Button>
        {saved ? (
          <span role={'status'} className={'text-success text-sm'}>
            Saved
          </span>
        ) : null}
        {refusal ? (
          <span role={'alert'} className={'text-destructive text-sm'}>
            {refusal}
          </span>
        ) : null}
      </div>
    </form>
  );
}

export function CounselDetailsMenu({
  prompt,
  ...details
}: Details & { prompt: boolean }) {
  const router = useRouter();
  const [refusal, setRefusal] = useState<string | null>(null);
  const [isSkipping, startSkipping] = useTransition();

  return (
    <div className={'flex flex-wrap items-center justify-end gap-2 text-sm'}>
      {prompt ? (
        <>
          <span className={'text-muted-foreground'}>
            Add a phone number so the deal team can reach you.
          </span>
          <Button
            type={'button'}
            variant={'ghost'}
            size={'sm'}
            disabled={isSkipping}
            onClick={() =>
              startSkipping(async () => {
                const result = await skipCounselProfilePrompt({
                  dealId: details.dealId,
                });

                setRefusal(result.ok ? null : result.refusal);

                if (result.ok) {
                  router.refresh();
                }
              })
            }
          >
            Skip
          </Button>
          {refusal ? (
            <span role={'alert'} className={'text-destructive'}>
              {refusal}
            </span>
          ) : null}
        </>
      ) : null}
      <Dialog>
        <DialogTrigger asChild>
          <Button type={'button'} variant={'outline'} size={'sm'}>
            Your details
          </Button>
        </DialogTrigger>
        <DialogContent className={'sm:max-w-sm'}>
          <DialogHeader>
            <DialogTitle>Your details</DialogTitle>
            <DialogDescription>
              Check your name and add a phone number so the deal team can reach
              you.
            </DialogDescription>
          </DialogHeader>
          <CounselDetailsForm {...details} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
