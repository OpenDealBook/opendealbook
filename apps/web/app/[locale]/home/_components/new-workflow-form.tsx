'use client';

import { type FormEvent, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { Button } from '@odb/ui/button';
import { Input } from '@odb/ui/input';

import { createWorkflow } from '../[account]/workflows/editor-actions';

export function NewWorkflowForm({
  accountId,
  basePath,
}: {
  accountId: string;
  basePath: string;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function create(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createWorkflow({ accountId, name });

      if (result.ok) {
        router.push(`${basePath}/${result.value.workflowId}/edit`);
      } else {
        setRefusal(result.refusal);
      }
    });
  }

  return (
    <form onSubmit={create} className={'flex flex-wrap items-center gap-2'}>
      <Input
        aria-label={'Workflow name'}
        placeholder={'Workflow name'}
        required
        value={name}
        onChange={(event) => setName(event.target.value)}
        className={'w-56'}
      />
      <Button type={'submit'} size={'sm'} disabled={isPending}>
        New workflow
      </Button>
      {refusal ? (
        <p role={'alert'} className={'text-destructive w-full text-sm'}>
          {refusal}
        </p>
      ) : null}
    </form>
  );
}
