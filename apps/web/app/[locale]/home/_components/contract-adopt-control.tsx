'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { adoptContractVersion } from '@odb/contracts/server';
import { Button } from '@odb/ui/button';

export function ContractAdoptControl({
  contractVersionId,
  current,
}: {
  contractVersionId: string;
  current: boolean;
}) {
  const router = useRouter();
  const [isAdopting, startAdopting] = useTransition();
  const [refusal, setRefusal] = useState<string | null>(null);

  if (current) {
    return <span className={'text-sm font-medium'}>Current</span>;
  }

  function onAdopt() {
    startAdopting(async () => {
      const adopted = await adoptContractVersion({ contractVersionId });

      if (!adopted.ok) {
        setRefusal(adopted.refusal);
        return;
      }

      setRefusal(null);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type={'button'}
        variant={'outline'}
        size={'sm'}
        onClick={onAdopt}
        disabled={isAdopting}
      >
        Make current
      </Button>
      {refusal ? (
        <p role={'alert'} className={'text-destructive text-sm'}>
          {refusal}
        </p>
      ) : null}
    </>
  );
}
