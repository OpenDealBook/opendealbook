'use client';

import { useState } from 'react';

import { Button } from '@odb/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { Input } from '@odb/ui/input';

import { setSellerSendLimitAction } from '../lib/server/admin-actions';

export function SellerSendLimitCard({
  accountId,
  dailyLimit,
  onSaved,
}: {
  accountId: string;
  dailyLimit: number | null;
  onSaved: () => Promise<void>;
}) {
  const [value, setValue] = useState(dailyLimit?.toString() ?? '');

  async function save(next: number | null) {
    await setSellerSendLimitAction({ accountId, dailyLimit: next });
    await onSaved();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Seller sends per 24 hours</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          {dailyLimit === null
            ? 'Default: 10 while on trial, 50 otherwise.'
            : `Set for this team: ${dailyLimit}. 0 blocks sending.`}
        </p>
        <div className="flex gap-2">
          <Input
            aria-label="Seller sends per 24 hours"
            type="number"
            min={0}
            step={1}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <Button
            disabled={!/^\d+$/.test(value)}
            onClick={() => save(Number(value))}
          >
            Save
          </Button>
          <Button
            variant="outline"
            disabled={dailyLimit === null}
            onClick={async () => {
              setValue('');
              await save(null);
            }}
          >
            Use default
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
