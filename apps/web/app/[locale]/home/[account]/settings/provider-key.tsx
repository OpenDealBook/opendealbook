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
};

export function ProviderKeySetting({
  accountId,
  kind,
  current,
  canManage,
}: {
  accountId: string;
  kind: keyof typeof KINDS;
  current: { actorId: string | null } | null;
  canManage: boolean;
}) {
  const { title, description, provider, stepsFail } = KINDS[kind];
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
                  }),
                () => {
                  setApiKey('');
                  setWebhookSecret('');
                },
              );
            }}
          >
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
