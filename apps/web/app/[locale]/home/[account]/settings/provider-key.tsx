'use client';

import { useState } from 'react';

import { Button } from '@odb/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@odb/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@odb/ui/dialog';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';

import appConfig from '../../../../../config/app.config';

import { useRefusableAction } from '../../_components/use-refusable-action';
import { disconnectProviderKeyAction, saveProviderKeyAction } from './provider-key-actions';

const KINDS = {
  email_lookup: {
    title: 'Email lookup',
    description: "Finds owners' emails with Apify on your team's own key.",
    provider: 'Apify',
    stepsFail: 'Email lookup steps in workflows will fail until you connect it again.',
  },
  letters: {
    title: 'Letters',
    description: "Mails letters through Lob on your team's own key.",
    provider: 'Lob',
    stepsFail: 'Letter steps in workflows will fail until you connect it again.',
  },
  courts: {
    title: 'Federal courts',
    description: "Searches federal and bankruptcy court dockets on CourtListener with your team's own free token.",
    provider: 'CourtListener',
    stepsFail: 'Diligence will skip federal courts until you connect it again.',
  },
  court_records: {
    title: 'State court and lien records',
    description:
      "Searches the business's state court cases, liens and UCC filings through your team's broker, Baselayer or Middesk. A team connects one broker.",
    stepsFail: 'Diligence will skip state court and lien records until you connect it again.',
  },
};

const BROKERS = { baselayer: 'Baselayer', middesk: 'Middesk' };

type Broker = keyof typeof BROKERS;

function isBroker(provider: string): provider is Broker {
  return Object.hasOwn(BROKERS, provider);
}

export function ProviderKeySetting({
  accountId,
  kind,
  current,
  canManage,
}: {
  accountId: string;
  kind: keyof typeof KINDS;
  current: { actorId: string | null; provider: string } | null;
  canManage: boolean;
}) {
  const { title, description, stepsFail } = KINDS[kind];
  const [broker, setBroker] = useState<Broker>(current && isBroker(current.provider) ? current.provider : 'baselayer');
  const provider = kind === 'court_records' ? BROKERS[broker] : KINDS[kind].provider;
  const { refusal, pending, run } = useRefusableAction();
  const [apiKey, setApiKey] = useState('');
  const [actorId, setActorId] = useState(current?.actorId ?? '');
  const [webhookSecret, setWebhookSecret] = useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {canManage ? (
          <form
            className={'flex max-w-md flex-col gap-3'}
            onSubmit={(event) => {
              event.preventDefault();
              run(
                () =>
                  saveProviderKeyAction({
                    accountId,
                    kind,
                    apiKey,
                    actorId,
                    ...(kind === 'letters' && { webhookSecret }),
                    ...(kind === 'court_records' && { provider: broker }),
                  }),
                () => {
                  setApiKey('');
                  setWebhookSecret('');
                },
              );
            }}
          >
            {kind === 'court_records' ? (
              <Label className={'flex flex-col items-start gap-1'}>
                Broker
                <select
                  className={'bg-background h-9 w-full rounded-md border px-2 text-sm'}
                  value={broker}
                  disabled={pending}
                  onChange={(event) => setBroker(event.target.value as Broker)}
                >
                  {Object.entries(BROKERS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Label>
            ) : null}
            {kind === 'court_records' && current && isBroker(current.provider) && current.provider !== broker ? (
              <p className={'text-muted-foreground text-sm'}>
                Saving replaces the saved {BROKERS[current.provider]} key.
              </p>
            ) : null}
            <Label className={'flex flex-col items-start gap-1'}>
              {provider} API key
              <Input
                type={'password'}
                autoComplete={'off'}
                value={apiKey}
                placeholder={current ? 'Saved. Paste a new key to replace it' : undefined}
                disabled={pending}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </Label>
            {kind === 'email_lookup' ? (
              <Label className={'flex flex-col items-start gap-1'}>
                Apify actor
                <Input
                  value={actorId}
                  placeholder={'vdrmota/contact-info-scraper'}
                  disabled={pending}
                  onChange={(event) => setActorId(event.target.value)}
                />
              </Label>
            ) : null}
            {kind === 'letters' ? (
              <>
                <Label className={'flex flex-col items-start gap-1'}>
                  Lob webhook secret
                  <Input
                    type={'password'}
                    autoComplete={'off'}
                    value={webhookSecret}
                    placeholder={current ? 'Paste a new secret to replace the saved one' : undefined}
                    disabled={pending}
                    onChange={(event) => setWebhookSecret(event.target.value)}
                  />
                </Label>
                <p className={'text-muted-foreground text-sm break-all'}>
                  Lob webhook address: {`${appConfig.url}/api/webhooks/lob/${accountId}`}
                </p>
              </>
            ) : null}
            {refusal ? (
              <p role={'alert'} className={'text-destructive text-sm'}>
                {refusal}
              </p>
            ) : null}
            <div className={'flex gap-2'}>
              <Button type={'submit'} disabled={pending}>
                Save
              </Button>
              {current ? (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button type={'button'} variant={'outline'} disabled={pending}>
                      Disconnect
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Disconnect {provider}?</DialogTitle>
                      <DialogDescription>{stepsFail}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button type={'button'} variant={'outline'}>
                          Cancel
                        </Button>
                      </DialogClose>
                      <DialogClose asChild>
                        <Button
                          type={'button'}
                          variant={'destructive'}
                          onClick={() => run(() => disconnectProviderKeyAction({ accountId, kind }))}
                        >
                          Disconnect
                        </Button>
                      </DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              ) : null}
            </div>
          </form>
        ) : current ? (
          <p className={'text-sm'}>
            Connected to {provider}
            {current.actorId ? `, actor ${current.actorId}` : ''}
          </p>
        ) : (
          <p className={'text-muted-foreground text-sm'}>Not connected</p>
        )}
      </CardContent>
    </Card>
  );
}
