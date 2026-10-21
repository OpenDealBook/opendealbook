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

import { useRefusableAction } from '../../_components/use-refusable-action';
import { disconnectAiProviderAction, saveAiProviderAction } from './ai-provider-actions';

const PROVIDERS = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  openai_compatible: 'OpenAI-compatible endpoint',
};

type Provider = keyof typeof PROVIDERS;

interface Endpoint {
  provider: string;
  model: string;
  baseUrl: string;
}

export function AiProviderSetting({
  accountId,
  current,
  canManage,
}: {
  accountId: string;
  current: Endpoint | null;
  canManage: boolean;
}) {
  const { refusal, pending, run } = useRefusableAction();
  const [provider, setProvider] = useState((current?.provider ?? 'openai') as Provider);
  const [model, setModel] = useState(current?.model ?? '');
  const [baseUrl, setBaseUrl] = useState(current?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI provider</CardTitle>
        <CardDescription>
          Workflow AI steps and the decision model run on your team&apos;s own
          provider and key.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {canManage ? (
          <form
            className={'flex max-w-md flex-col gap-3'}
            onSubmit={(event) => {
              event.preventDefault();
              run(
                () => saveAiProviderAction({ accountId, provider, model, baseUrl, apiKey }),
                () => setApiKey(''),
              );
            }}
          >
            <Label className={'flex flex-col items-start gap-1'}>
              Provider
              <select
                aria-label={'Provider'}
                className={'bg-background h-9 w-full rounded-md border px-2 text-sm'}
                value={provider}
                disabled={pending}
                onChange={(event) => setProvider(event.target.value as Provider)}
              >
                {Object.entries(PROVIDERS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Label>
            <Label className={'flex flex-col items-start gap-1'}>
              Model
              <Input
                aria-label={'Model'}
                value={model}
                disabled={pending}
                onChange={(event) => setModel(event.target.value)}
              />
            </Label>
            {provider === 'openai_compatible' ? (
              <Label className={'flex flex-col items-start gap-1'}>
                Base URL
                <Input
                  aria-label={'Base URL'}
                  type={'url'}
                  value={baseUrl}
                  disabled={pending}
                  onChange={(event) => setBaseUrl(event.target.value)}
                />
              </Label>
            ) : null}
            <Label className={'flex flex-col items-start gap-1'}>
              API key
              <Input
                aria-label={'API key'}
                type={'password'}
                autoComplete={'off'}
                value={apiKey}
                placeholder={current ? 'Saved. Paste a new key to replace it' : undefined}
                disabled={pending}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </Label>
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
                      <DialogTitle>Disconnect the AI provider?</DialogTitle>
                      <DialogDescription>
                        AI steps in workflows will fail until you connect one again.
                      </DialogDescription>
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
                          onClick={() => run(() => disconnectAiProviderAction({ accountId }))}
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
            {PROVIDERS[current.provider as Provider]}, {current.model}
          </p>
        ) : (
          <p className={'text-muted-foreground text-sm'}>No AI provider connected</p>
        )}
      </CardContent>
    </Card>
  );
}
