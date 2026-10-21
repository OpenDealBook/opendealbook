'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { removeSeller } from '@odb/seller-rooms/members/actions.ts';
import type { SellerRoomPerson } from '@odb/seller-rooms/members/people.ts';
import { Button } from '@odb/ui/button';

export function SellerRoomPeople({
  dealId,
  people,
  blockedReason,
}: {
  dealId: string;
  people: SellerRoomPerson[];
  blockedReason: string | null;
}) {
  const router = useRouter();
  const [refusal, setRefusal] = useState<string | null>(null);

  async function remove(person: SellerRoomPerson) {
    const result = await removeSeller({ dealId, memberId: person.id });

    setRefusal(result.ok ? null : result.refusal);
    router.refresh();
  }

  return (
    <section className={'flex flex-col gap-1'}>
      <h3 className={'text-sm font-medium'}>Sellers in the room</h3>
      <ul className={'flex flex-col gap-1'}>
        {people.map((person) => (
          <li
            key={person.id}
            className={'flex flex-wrap items-center gap-x-2 text-sm'}
          >
            <span className={'min-w-0 break-words'}>
              {person.email ? `${person.name} (${person.email})` : person.name}
            </span>
            <Button
              type={'button'}
              size={'sm'}
              variant={'ghost'}
              aria-label={`Remove ${person.name}`}
              disabled={blockedReason !== null}
              onClick={() => void remove(person)}
            >
              Remove {person.name}
            </Button>
          </li>
        ))}
      </ul>
      {blockedReason ? (
        <p className={'text-muted-foreground text-sm'}>{blockedReason}</p>
      ) : null}
      {refusal ? (
        <p role={'alert'} className={'text-destructive text-sm'}>
          {refusal}
        </p>
      ) : null}
    </section>
  );
}
