'use client';

import { useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { spinUpLenderRooms } from '@odb/lender-rooms/crm/spin-up/actions.ts';
import { ProblemNote } from '@odb/lender-rooms/requests-ui/refusal-note.tsx';
import { useAttempt } from '@odb/lender-rooms/requests-ui/use-attempt.ts';
import { Button } from '@odb/ui/button';

import { countWording, teamSignInPath } from '../lender-wording';

export interface PickableLender {
  id: string;
  name: string;
  primaryName: string | null;
}

type SpunUp = Extract<
  Awaited<ReturnType<typeof spinUpLenderRooms>>,
  { ok: true }
>['value'];

const RESULT_WORDING = {
  created: 'room created',
  already_has_room: 'already had a room',
} as const;

export function LenderSpinUp({
  dealId,
  teamPath,
  lenders,
}: {
  dealId: string;
  teamPath: string;
  lenders: PickableLender[];
}) {
  const router = useRouter();
  const settingUp = useAttempt();
  const [picked, setPicked] = useState<string[]>([]);
  const [results, setResults] = useState<SpunUp>([]);
  const nameOf = new Map(lenders.map((lender) => [lender.id, lender.name]));
  const primaryOf = new Map(
    lenders.map((lender) => [lender.id, lender.primaryName]),
  );
  const unemailed = results
    .filter((result) => result.emailFailed)
    .map((result) => primaryOf.get(result.lenderId));

  if (lenders.length === 0) {
    return (
      <p className={'text-muted-foreground text-sm'}>
        No saved lenders yet.{' '}
        <Link href={`${teamPath}/lenders/saved`} className={'underline'}>
          Save your lenders
        </Link>{' '}
        to set up rooms for several at once.
      </p>
    );
  }

  function setUp() {
    settingUp.attempt(
      async () => {
        const result = await spinUpLenderRooms({ dealId, lenderIds: picked });

        if (result.ok) {
          setResults(result.value);
        }

        return result;
      },
      () => {
        setPicked([]);
        router.refresh();
      },
    );
  }

  return (
    <div className={'flex flex-col gap-3'}>
      <ul className={'grid gap-2 sm:grid-cols-2'}>
        {lenders.map((lender) => (
          <li key={lender.id}>
            <label
              className={
                'has-[:disabled]:text-muted-foreground flex items-center gap-3 rounded-lg border px-3 py-2 text-sm'
              }
            >
              <input
                type={'checkbox'}
                className={'accent-primary size-4'}
                disabled={lender.primaryName === null}
                checked={picked.includes(lender.id)}
                onChange={(event) =>
                  setPicked(
                    event.target.checked
                      ? [...picked, lender.id]
                      : picked.filter((id) => id !== lender.id),
                  )
                }
              />
              <span className={'font-medium'}>{lender.name}</span>
              <span className={'text-muted-foreground ml-auto'}>
                {lender.primaryName ?? 'No primary contact'}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <ProblemNote problem={settingUp.problem} signInPath={teamSignInPath} />
      <Button
        className={'w-fit'}
        disabled={picked.length === 0 || settingUp.isPending}
        onClick={setUp}
      >
        {picked.length === 0
          ? 'Set up rooms'
          : `Set up ${countWording(picked.length, 'room', 'rooms')}`}
      </Button>
      {results.length > 0 ? (
        <ul role={'status'} className={'flex flex-col gap-1 text-sm'}>
          {results.map((result) => (
            <li key={result.lenderId}>
              {nameOf.get(result.lenderId)} {RESULT_WORDING[result.status]}
            </li>
          ))}
        </ul>
      ) : null}
      {unemailed.length > 0 ? (
        <p className={'text-destructive text-sm'}>
          Rooms set up, but these contacts got no email: {unemailed.join(', ')}
        </p>
      ) : null}
    </div>
  );
}
