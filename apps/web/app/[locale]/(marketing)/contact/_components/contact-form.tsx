'use client';

import { useState, useTransition, type FormEvent } from 'react';

import { Button } from '@odb/ui/button';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import { Textarea } from '@odb/ui/textarea';

import { useAnalytics } from '~/components/analytics-provider';
import { AnalyticsEvents } from '~/config/analytics-events';

import { submitContactLead } from '../_lib/contact-actions';

export function ContactForm() {
  const analytics = useAnalytics();
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const data = new FormData(event.currentTarget);
    const company = String(data.get('company') ?? '').trim();

    startTransition(async () => {
      await submitContactLead({
        name: String(data.get('name') ?? ''),
        email: String(data.get('email') ?? ''),
        company: company === '' ? undefined : company,
        message: String(data.get('message') ?? ''),
      });

      void analytics.trackEvent(AnalyticsEvents.contactSubmitted);
      setSent(true);
    });
  }

  if (sent) {
    return (
      <div className={'flex flex-col gap-2'}>
        <p className={'font-medium'}>Thanks, your message is in.</p>
        <p className={'text-muted-foreground text-sm'}>
          We read every note and will reply to your email shortly.
        </p>
      </div>
    );
  }

  return (
    <form className={'flex flex-col gap-4'} onSubmit={onSubmit}>
      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'name'}>Name</Label>
        <Input id={'name'} name={'name'} placeholder={'Your name'} required />
      </div>

      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'email'}>Email</Label>
        <Input
          id={'email'}
          name={'email'}
          type={'email'}
          placeholder={'you@example.com'}
          required
        />
      </div>

      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'company'}>Company</Label>
        <Input
          id={'company'}
          name={'company'}
          placeholder={'Your firm'}
        />
      </div>

      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'message'}>Message</Label>
        <Textarea
          id={'message'}
          name={'message'}
          placeholder={'How can we help?'}
          required
        />
      </div>

      <Button type={'submit'} disabled={isPending}>
        {isPending ? 'Sending...' : 'Send message'}
      </Button>
    </form>
  );
}
