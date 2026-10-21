'use client';

import { useRouter } from 'next/navigation';

import { updatePersonalPhoneAction } from '@odb/accounts/server/personal-account-actions';
import { Button } from '@odb/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@odb/ui/card';
import { Input } from '@odb/ui/input';

export function PhoneSetting({ current }: { current: string | null }) {
  const router = useRouter();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Phone</CardTitle>
        <CardDescription>
          Optional. Shown to the people on your deals.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className={'flex flex-wrap items-center gap-2'}
          action={async (formData) => {
            await updatePersonalPhoneAction({
              phone: String(formData.get('phone')),
            });
            router.refresh();
          }}
        >
          <Input
            name={'phone'}
            aria-label={'Phone'}
            type={'tel'}
            autoComplete={'tel'}
            maxLength={50}
            defaultValue={current ?? ''}
            className={'max-w-xs'}
          />
          <Button type={'submit'} variant={'outline'}>
            Save
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
