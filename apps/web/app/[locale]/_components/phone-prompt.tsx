'use client';

import { useRouter } from 'next/navigation';

import {
  answerPhonePrompt,
  skipPhonePrompt,
} from '@odb/accounts/server/personal-account-actions';
import { Button } from '@odb/ui/button';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';

export function PhonePrompt() {
  const router = useRouter();

  return (
    <form
      className={'flex flex-col gap-2'}
      action={async (formData) => {
        await answerPhonePrompt({ phone: String(formData.get('phone')) });
        router.refresh();
      }}
    >
      <Label htmlFor={'phone-prompt'}>Add a phone number (optional)</Label>
      <Input
        id={'phone-prompt'}
        name={'phone'}
        type={'tel'}
        autoComplete={'tel'}
        maxLength={50}
        className={'max-w-xs'}
      />
      <div className={'flex gap-2'}>
        <Button type={'submit'}>Save</Button>
        <Button
          type={'button'}
          variant={'outline'}
          onClick={async () => {
            await skipPhonePrompt({});
            router.refresh();
          }}
        >
          Skip
        </Button>
      </div>
    </form>
  );
}
