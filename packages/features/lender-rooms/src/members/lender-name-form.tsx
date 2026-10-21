'use client';

import { useRouter } from 'next/navigation';

import { Button } from '@odb/ui/button';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';

import { setMyLenderName, skipLenderNamePrompt } from './actions';

export function LenderNameForm({
  initialName,
  allowSkip,
}: {
  initialName: string | null;
  allowSkip: boolean;
}) {
  const router = useRouter();

  return (
    <form
      className={'flex flex-col gap-2'}
      action={async (formData) => {
        await setMyLenderName(
          allowSkip
            ? {
                name: String(formData.get('name')),
                phone: String(formData.get('phone')),
              }
            : { name: String(formData.get('name')) },
        );
        router.refresh();
      }}
    >
      <Label htmlFor={'lender-name'}>Your name</Label>
      <Input
        id={'lender-name'}
        name={'name'}
        defaultValue={initialName ?? ''}
        autoComplete={'name'}
        required
      />
      {allowSkip && (
        <>
          <Label htmlFor={'lender-phone'}>Phone (optional)</Label>
          <Input
            id={'lender-phone'}
            name={'phone'}
            type={'tel'}
            autoComplete={'tel'}
            maxLength={50}
          />
        </>
      )}
      <div className={'flex gap-2'}>
        <Button type={'submit'}>Save</Button>
        {allowSkip && (
          <Button
            type={'button'}
            variant={'outline'}
            onClick={async () => {
              await skipLenderNamePrompt({});
              router.refresh();
            }}
          >
            Skip
          </Button>
        )}
      </div>
    </form>
  );
}
