'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import {
  DEFAULT_TEMPLATE,
  type OutreachTemplate,
} from '@odb/lender-outreach/default-template.ts';
import { TEMPLATE_FIELDS } from '@odb/lender-outreach/draft-email.ts';
import {
  resetOutreachTemplate,
  saveOutreachTemplate,
} from '@odb/lender-outreach/template-actions.ts';
import { setQuietDays } from '@odb/lender-rooms/crm/nudges/actions.ts';
import { ProblemNote } from '@odb/lender-rooms/requests-ui/refusal-note.tsx';
import { useAttempt } from '@odb/lender-rooms/requests-ui/use-attempt.ts';
import { Button } from '@odb/ui/button';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import { Textarea } from '@odb/ui/textarea';

import { teamSignInPath } from '../lender-wording';
import { ConfirmButton } from './confirm-button';

export function QuietDaysForm({
  accountId,
  quietDays,
}: {
  accountId: string;
  quietDays: number;
}) {
  const router = useRouter();
  const saving = useAttempt();
  const [days, setDays] = useState(String(quietDays));

  return (
    <form
      className={'flex flex-col gap-3'}
      onSubmit={(event) => {
        event.preventDefault();
        saving.attempt(
          () => setQuietDays({ accountId, quietDays: Number(days) }),
          () => router.refresh(),
        );
      }}
    >
      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'lender-quiet-days'}>Days quiet before a nudge</Label>
        <p className={'text-muted-foreground text-sm'}>
          An open room shows under Lenders to nudge once the lender has said
          nothing for this many days.
        </p>
        <Input
          id={'lender-quiet-days'}
          type={'number'}
          min={1}
          step={1}
          className={'w-28'}
          value={days}
          onChange={(event) => setDays(event.target.value)}
        />
      </div>
      <ProblemNote problem={saving.problem} signInPath={teamSignInPath} />
      <Button type={'submit'} className={'w-fit'} disabled={saving.isPending}>
        Save quiet days
      </Button>
    </form>
  );
}

export function OutreachTemplateForm({
  accountId,
  template,
}: {
  accountId: string;
  template: OutreachTemplate;
}) {
  const router = useRouter();
  const saving = useAttempt();
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);

  return (
    <form
      className={'flex flex-col gap-4'}
      onSubmit={(event) => {
        event.preventDefault();
        saving.attempt(
          () => saveOutreachTemplate({ accountId, subject, body }),
          () => router.refresh(),
        );
      }}
    >
      <p className={'text-muted-foreground max-w-prose text-sm'}>
        The first email to each lender on a deal starts from this template.
        These fields fill in for each lender:{' '}
        {TEMPLATE_FIELDS.map((name) => `{{${name}}}`).join(', ')}.
      </p>
      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'lender-template-subject'}>Subject</Label>
        <Input
          id={'lender-template-subject'}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
      </div>
      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'lender-template-body'}>Body</Label>
        <Textarea
          id={'lender-template-body'}
          rows={18}
          className={'font-mono text-sm'}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </div>
      <ProblemNote problem={saving.problem} signInPath={teamSignInPath} />
      <div className={'flex gap-2'}>
        <Button type={'submit'} disabled={saving.isPending}>
          Save template
        </Button>
        <ConfirmButton
          variant={'outline'}
          title={'Reset the outreach template?'}
          description={
            'Your saved subject and body are replaced with the default wording.'
          }
          confirmLabel={'Reset template'}
          action={() => resetOutreachTemplate({ accountId })}
          onDone={() => {
            setSubject(DEFAULT_TEMPLATE.subject);
            setBody(DEFAULT_TEMPLATE.body);
            router.refresh();
          }}
        >
          Reset to default
        </ConfirmButton>
      </div>
    </form>
  );
}
