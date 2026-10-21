'use client';

import { Button } from '@odb/ui/button';

import { useRefusableAction } from '../../_components/use-refusable-action';
import { reloadSampleData } from '../../_lib/trial-actions';

export function ReloadSampleDeals({ accountId }: { accountId: string }) {
  const { refusal, pending, run } = useRefusableAction();

  return (
    <section className={'flex flex-col items-start gap-2'}>
      <h2 className={'text-lg font-medium'}>Sample deals</h2>
      <p className={'text-muted-foreground text-sm'}>
        Add the example deals back to this team to try features without
        touching real work.
      </p>
      <Button
        type={'button'}
        variant={'outline'}
        disabled={pending}
        onClick={() => run(() => reloadSampleData({ accountId }))}
      >
        Reload sample deals
      </Button>
      {refusal ? (
        <p role={'alert'} className={'text-destructive text-sm'}>
          {refusal}
        </p>
      ) : null}
    </section>
  );
}
