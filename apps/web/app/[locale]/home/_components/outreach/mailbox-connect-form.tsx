'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import Nango from '@nangohq/frontend';

import {
  connectMailbox,
  createMailboxConnectSession,
} from '@odb/outreach-app/server';
import { Button } from '@odb/ui/button';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@odb/ui/select';

type Provider = 'gmail' | 'microsoft';

export function MailboxConnectForm({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [provider, setProvider] = useState<Provider>('gmail');
  const [emailAddress, setEmailAddress] = useState('');

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const sessionToken = await createMailboxConnectSession({
          accountId,
          provider,
        });

        new Nango({ connectSessionToken: sessionToken }).openConnectUI({
          onEvent: async (connectEvent) => {
            if (connectEvent.type !== 'connect') {
              return;
            }

            await connectMailbox({
              accountId,
              provider,
              nangoConnectionId: connectEvent.payload.connectionId,
              providerConfigKey: connectEvent.payload.providerConfigKey,
              emailAddress,
              status: 'active',
            });

            router.refresh();
          },
        });
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not start the mailbox connection',
        );
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className={'flex max-w-xl flex-col gap-4'}>
      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'mailbox-provider'}>Provider</Label>
        <Select
          value={provider}
          onValueChange={(value) => setProvider(value as Provider)}
        >
          <SelectTrigger id={'mailbox-provider'} className={'w-60'}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={'gmail'}>Gmail</SelectItem>
            <SelectItem value={'microsoft'}>Microsoft</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'mailbox-email'}>Mailbox address</Label>
        <Input
          id={'mailbox-email'}
          type={'email'}
          required
          value={emailAddress}
          onChange={(event) => setEmailAddress(event.target.value)}
        />
      </div>

      {error !== null ? (
        <p className={'text-destructive text-sm'}>{error}</p>
      ) : null}

      <div>
        <Button type={'submit'} disabled={pending}>
          {pending ? 'Connecting...' : 'Connect mailbox'}
        </Button>
      </div>
    </form>
  );
}
