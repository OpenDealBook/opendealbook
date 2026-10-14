'use client';

import { Button } from '@odb/ui/button';
import { Input } from '@odb/ui/input';

export interface Signer {
  name: string;
  email: string;
}

export const oneBlankSigner: Signer[] = [{ name: '', email: '' }];

export function SignerInputs({
  signers,
  onChange,
}: {
  signers: Signer[];
  onChange: (signers: Signer[]) => void;
}) {
  function edit(position: number, change: Partial<Signer>) {
    onChange(
      signers.map((signer, index) =>
        index === position ? { ...signer, ...change } : signer,
      ),
    );
  }

  return (
    <div className={'flex flex-col gap-2'}>
      {signers.map((signer, index) => (
        <div key={index} className={'flex flex-wrap items-center gap-2'}>
          <Input
            aria-label={`Signer ${index + 1} name`}
            placeholder={'Full name'}
            className={'w-full sm:w-56'}
            value={signer.name}
            onChange={(event) => edit(index, { name: event.target.value })}
            required
          />
          <Input
            aria-label={`Signer ${index + 1} email`}
            type={'email'}
            placeholder={'name@company.com'}
            className={'w-full sm:w-64'}
            value={signer.email}
            onChange={(event) => edit(index, { email: event.target.value })}
            required
          />
          {signers.length > 1 ? (
            <Button
              type={'button'}
              size={'sm'}
              variant={'ghost'}
              aria-label={`Remove signer ${index + 1}`}
              onClick={() =>
                onChange(signers.filter((_, position) => position !== index))
              }
            >
              Remove
            </Button>
          ) : null}
        </div>
      ))}
      <Button
        type={'button'}
        size={'sm'}
        variant={'outline'}
        className={'w-fit'}
        onClick={() => onChange([...signers, ...oneBlankSigner])}
      >
        Add signer
      </Button>
    </div>
  );
}
