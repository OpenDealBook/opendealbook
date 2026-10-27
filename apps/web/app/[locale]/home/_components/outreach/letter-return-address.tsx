'use client';

import { useState } from 'react';

import { Button } from '@odb/ui/button';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';

import { useRefusableAction } from '../use-refusable-action';
import { saveLetterReturnAddressAction } from './letter-return-address-actions';

export interface ReturnAddress {
  name: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
}

const FIELDS: { key: keyof ReturnAddress; label: string }[] = [
  { key: 'name', label: 'Return name' },
  { key: 'addressLine1', label: 'Street address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'postalCode', label: 'ZIP code' },
];

export function LetterReturnAddress({
  accountId,
  address,
}: {
  accountId: string;
  address: ReturnAddress | null;
}) {
  const { refusal, pending, run } = useRefusableAction();
  const [values, setValues] = useState<ReturnAddress>(
    address ?? { name: '', addressLine1: '', city: '', state: '', postalCode: '' },
  );

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(() => saveLetterReturnAddressAction({ accountId, ...values }));
  }

  return (
    <form onSubmit={onSubmit} className={'flex flex-col gap-4'}>
      {address === null ? (
        <p className={'text-muted-foreground text-sm'}>
          Letters are not sent until a return address is set.
        </p>
      ) : null}

      <div className={'grid max-w-3xl gap-4 md:grid-cols-2'}>
        {FIELDS.map(({ key, label }) => (
          <div key={key} className={'flex flex-col gap-2'}>
            <Label htmlFor={`letter-return-${key}`}>{label}</Label>
            <Input
              id={`letter-return-${key}`}
              required
              value={values[key]}
              onChange={(event) => setValues({ ...values, [key]: event.target.value })}
            />
          </div>
        ))}
      </div>

      {refusal ? (
        <p role={'alert'} className={'text-destructive text-sm'}>
          {refusal}
        </p>
      ) : null}

      <div>
        <Button type={'submit'} disabled={pending}>
          {pending ? 'Saving...' : 'Save return address'}
        </Button>
      </div>
    </form>
  );
}
