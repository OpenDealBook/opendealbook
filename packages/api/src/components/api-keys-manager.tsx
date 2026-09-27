'use client';

import { useState, useTransition } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@tuckin/ui/alert';
import { Button } from '@tuckin/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuckin/ui/card';
import { Input } from '@tuckin/ui/input';
import { Label } from '@tuckin/ui/label';

import { createApiKey, listApiKeys, revokeApiKey } from '../server';

export interface ApiKeySummary {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

interface ApiKeysManagerProps {
  accountId: string;
  initialKeys: ApiKeySummary[];
}

export function ApiKeysManager({
  accountId,
  initialKeys,
}: ApiKeysManagerProps) {
  const [keys, setKeys] = useState<ApiKeySummary[]>(initialKeys);
  const [name, setName] = useState('');
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onCreate() {
    startTransition(async () => {
      const created = await createApiKey({ accountId, name });
      setRawKey(created.rawKey);
      setCopied(false);
      setName('');
      setKeys(await listApiKeys({ accountId }));
    });
  }

  function onRevoke(id: string) {
    startTransition(async () => {
      await revokeApiKey({ accountId, id });
      setKeys(await listApiKeys({ accountId }));
    });
  }

  function onCopy() {
    if (rawKey) {
      void navigator.clipboard.writeText(rawKey);
      setCopied(true);
    }
  }

  return (
    <div className={'flex flex-col gap-6'}>
      <Card>
        <CardHeader>
          <CardTitle>Create API key</CardTitle>
          <CardDescription>
            Keys grant read access to this account through the public API and
            MCP server.
          </CardDescription>
        </CardHeader>
        <CardContent className={'flex flex-col gap-4'}>
          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'api-key-name'}>Name</Label>
            <Input
              id={'api-key-name'}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={'e.g. Reporting integration'}
            />
          </div>
          <Button
            type={'button'}
            onClick={onCreate}
            disabled={isPending || name.trim().length === 0}
          >
            Create key
          </Button>
        </CardContent>
      </Card>

      {rawKey ? (
        <Alert>
          <AlertTitle>Store this key now</AlertTitle>
          <AlertDescription className={'flex flex-col gap-2'}>
            <span>
              This is the only time the key is shown. Copy it and store it
              somewhere safe.
            </span>
            <code className={'text-sm break-all'}>{rawKey}</code>
            <Button type={'button'} variant={'outline'} onClick={onCopy}>
              {copied ? 'Copied' : 'Copy key'}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className={'flex flex-col gap-3'}>
        {keys.map((key) => (
          <Card key={key.id}>
            <CardContent className={'flex items-center justify-between gap-4'}>
              <div className={'flex flex-col gap-1'}>
                <span className={'font-medium'}>{key.name}</span>
                <span className={'text-muted-foreground text-sm'}>
                  {key.key_prefix} · {key.scopes.join(', ')}
                </span>
                <span className={'text-muted-foreground text-xs'}>
                  {key.last_used_at
                    ? `Last used ${key.last_used_at}`
                    : 'Never used'}
                </span>
              </div>
              {key.revoked_at ? (
                <span className={'text-muted-foreground text-sm'}>Revoked</span>
              ) : (
                <Button
                  type={'button'}
                  variant={'destructive'}
                  onClick={() => onRevoke(key.id)}
                  disabled={isPending}
                >
                  Revoke
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
