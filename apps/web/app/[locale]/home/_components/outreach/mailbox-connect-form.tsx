'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { connectMailbox } from '@odb/outreach-app/server';
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

// STUB: the real path opens a Nango connect session with the @nangohq/frontend
// SDK, then calls connectMailbox with the connection id it returns. That SDK is
// not installed in the workspace, so this form takes the Nango connection id,
// provider config key, and mailbox address by hand instead.
export function MailboxConnectForm({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [provider, setProvider] = useState<Provider>('gmail');
  const [nangoConnectionId, setNangoConnectionId] = useState('');
  const [providerConfigKey, setProviderConfigKey] = useState('');
  const [emailAddress, setEmailAddress] = useState('');

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        await connectMailbox({
          accountId,
          provider,
          nangoConnectionId,
          providerConfigKey,
          emailAddress,
          status: 'active',
        });
        setNangoConnectionId('');
        setProviderConfigKey('');
        setEmailAddress('');
        router.refresh();
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not connect the mailbox',
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

      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'mailbox-connection-id'}>Nango connection id</Label>
        <Input
          id={'mailbox-connection-id'}
          required
          value={nangoConnectionId}
          onChange={(event) => setNangoConnectionId(event.target.value)}
        />
      </div>

      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'mailbox-config-key'}>Provider config key</Label>
        <Input
          id={'mailbox-config-key'}
          required
          value={providerConfigKey}
          onChange={(event) => setProviderConfigKey(event.target.value)}
        />
        <p className={'text-muted-foreground text-xs'}>
          TODO: replace this paste form with the Nango frontend connect session;
          that is the real OAuth path.
        </p>
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
