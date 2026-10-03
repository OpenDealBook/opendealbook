'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { setOutreachSetting } from '@odb/outreach-app/server';
import { Button } from '@odb/ui/button';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';

export function SettingsForm({
  accountId,
  dailyCap,
  maxTouches,
}: {
  accountId: string;
  dailyCap: number;
  maxTouches: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [cap, setCap] = useState(String(dailyCap));
  const [touches, setTouches] = useState(String(maxTouches));

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    startTransition(async () => {
      try {
        await setOutreachSetting({
          accountId,
          dailyCap: Number(cap),
          maxTouches: Number(touches),
        });
        setSaved(true);
        router.refresh();
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : 'Could not save settings',
        );
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className={'flex max-w-sm flex-col gap-4'}>
      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'daily-cap'}>Daily send cap</Label>
        <Input
          id={'daily-cap'}
          type={'number'}
          min={1}
          required
          value={cap}
          onChange={(event) => setCap(event.target.value)}
        />
      </div>

      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'max-touches'}>Max touches</Label>
        <Input
          id={'max-touches'}
          type={'number'}
          min={1}
          required
          value={touches}
          onChange={(event) => setTouches(event.target.value)}
        />
      </div>

      {error !== null ? (
        <p className={'text-destructive text-sm'}>{error}</p>
      ) : null}

      {saved ? <p className={'text-sm'}>Saved.</p> : null}

      <div>
        <Button type={'submit'} disabled={pending}>
          {pending ? 'Saving...' : 'Save settings'}
        </Button>
      </div>
    </form>
  );
}
