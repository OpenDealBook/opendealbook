'use client';

import { useRouter } from 'next/navigation';

import { updatePersonalTimezoneAction } from '@odb/accounts/server/personal-account-actions';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@odb/ui/card';

export function TimezoneSetting({
  current,
  zones,
}: {
  current: string | null;
  zones: string[];
}) {
  const router = useRouter();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Time zone</CardTitle>
        <CardDescription>
          Daily digests arrive at 10 pm in this time zone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <select
          aria-label={'Time zone'}
          className={'bg-background h-9 rounded-md border px-2 text-sm'}
          defaultValue={current ?? ''}
          onChange={async (event) => {
            await updatePersonalTimezoneAction({
              timezone: event.target.value,
            });
            router.refresh();
          }}
        >
          <option value={''} disabled>
            Pick a time zone
          </option>
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </CardContent>
    </Card>
  );
}
