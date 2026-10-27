'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@odb/ui/card';

import { useRefusableAction } from '../../_components/use-refusable-action';
import { updateNameSpellingAction } from './background-search-actions';

type NameSpelling = 'source_priority' | 'newest_record';

export function BackgroundSearchSetting({
  accountId,
  current,
  canManage,
}: {
  accountId: string;
  current: NameSpelling;
  canManage: boolean;
}) {
  const { refusal, pending, run } = useRefusableAction();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Background search</CardTitle>
        <CardDescription>
          When records spell a name differently, show the spelling from the
          highest priority source or from the newest record.
        </CardDescription>
      </CardHeader>
      <CardContent className={'flex flex-col items-start gap-2'}>
        <label className={'flex items-center gap-2 text-sm'}>
          Show names as
          <select
            aria-label={'Show names as'}
            className={'bg-background h-9 rounded-md border px-2 text-sm'}
            defaultValue={current}
            disabled={!canManage || pending}
            onChange={(event) => {
              const spelling = event.target.value as NameSpelling;
              run(() => updateNameSpellingAction({ accountId, spelling }));
            }}
          >
            <option value={'source_priority'}>Source priority</option>
            <option value={'newest_record'}>Newest record</option>
          </select>
        </label>
        {refusal ? (
          <p role={'alert'} className={'text-destructive text-sm'}>
            {refusal}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
