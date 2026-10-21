'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { setContractVersionShared } from '@odb/contracts/server';
import { Button } from '@odb/ui/button';

export function ContractShareToggle({
  contractVersionId,
  shared,
}: {
  contractVersionId: string;
  shared: boolean;
}) {
  const router = useRouter();
  const [refusal, setRefusal] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  function onToggle() {
    startSaving(async () => {
      const result = await setContractVersionShared({
        contractVersionId,
        shared: !shared,
      });

      setRefusal(result.ok ? null : result.refusal);

      if (result.ok) {
        router.refresh();
      }
    });
  }

  return (
    <span className={'inline-flex items-center gap-2'}>
      <Button
        type={'button'}
        variant={'outline'}
        size={'sm'}
        onClick={onToggle}
        disabled={isSaving}
      >
        {shared ? 'Stop sharing' : 'Share with seller side'}
      </Button>
      {refusal ? (
        <span role={'alert'} className={'text-destructive text-sm'}>
          {refusal}
        </span>
      ) : null}
    </span>
  );
}
