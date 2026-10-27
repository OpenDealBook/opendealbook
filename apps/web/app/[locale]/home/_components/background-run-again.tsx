'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import type { ActionResult } from '@odb/next/refusal';
import { Button } from '@odb/ui/button';

export function BackgroundRunAgain({
  dealId,
  running,
  runBackgroundSearch,
}: {
  dealId: string;
  running: boolean;
  runBackgroundSearch: (input: {
    dealId: string;
    requestId: string;
  }) => Promise<ActionResult<unknown>>;
}) {
  const router = useRouter();
  const [refusal, setRefusal] = useState<string | null>(null);

  async function onRun() {
    const result = await runBackgroundSearch({
      dealId,
      requestId: crypto.randomUUID(),
    });

    setRefusal(result.ok ? null : result.refusal);
    router.refresh();
  }

  return (
    <div className={'flex flex-col items-end gap-1'}>
      <Button
        type={'button'}
        variant={'outline'}
        size={'sm'}
        disabled={running}
        onClick={onRun}
      >
        {running ? 'Running' : 'Run again'}
      </Button>
      {refusal ? (
        <p role={'alert'} className={'text-destructive max-w-xs text-sm'}>
          {refusal}
        </p>
      ) : null}
    </div>
  );
}
