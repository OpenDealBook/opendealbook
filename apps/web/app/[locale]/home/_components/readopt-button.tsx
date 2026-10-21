'use client';

import { adoptCalcVersion } from '@odb/deals/server';
import { Button } from '@odb/ui/button';

import { useRefusableAction } from './use-refusable-action';

export function ReadoptButton(props: {
  dealId: string;
  primaryCalcVersionId: string;
}) {
  const { refusal, pending, run } = useRefusableAction();

  return (
    <>
      <Button
        size={'sm'}
        className={'self-start'}
        disabled={pending}
        onClick={() =>
          run(() =>
            adoptCalcVersion({
              deal_id: props.dealId,
              calc_version_id: props.primaryCalcVersionId,
            }),
          )
        }
      >
        Re-adopt
      </Button>
      {refusal === null ? null : (
        <p role={'alert'} className={'text-destructive text-sm'}>
          {refusal}
        </p>
      )}
    </>
  );
}
