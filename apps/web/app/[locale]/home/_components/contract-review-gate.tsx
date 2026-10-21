'use client';

import { useId } from 'react';

import { setDealReviewGate, setTeamReviewGate } from '@odb/contracts';
import { Checkbox } from '@odb/ui/checkbox';
import { Label } from '@odb/ui/label';

import { useRefusableAction } from './use-refusable-action';

type ContractType = 'loi' | 'apa';
type Gates = Record<ContractType, boolean>;

function GateToggle({
  type,
  required,
  disabled,
  onChange,
}: {
  type: ContractType;
  required: boolean;
  disabled: boolean;
  onChange: (required: boolean) => void;
}) {
  const id = useId();
  const label = `${type.toUpperCase()} needs counsel sign-off`;

  return (
    <div className={'flex items-center gap-2'}>
      <Checkbox
        id={id}
        aria-label={label}
        checked={required}
        disabled={disabled}
        onCheckedChange={(checked) => onChange(checked === true)}
      />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}

function GateToggles({
  gates,
  save,
}: {
  gates: Gates;
  save: (
    type: ContractType,
    required: boolean,
  ) => ReturnType<typeof setDealReviewGate>;
}) {
  const { refusal, pending, run } = useRefusableAction();

  return (
    <div className={'flex flex-col gap-2'}>
      {(['loi', 'apa'] as const).map((type) => (
        <GateToggle
          key={type}
          type={type}
          required={gates[type]}
          disabled={pending}
          onChange={(required) => run(() => save(type, required))}
        />
      ))}
      {refusal ? (
        <p role={'alert'} className={'text-destructive text-sm'}>
          {refusal}
        </p>
      ) : null}
    </div>
  );
}

export function DealReviewGate({
  dealId,
  gates,
}: {
  dealId: string;
  gates: Gates;
}) {
  return (
    <GateToggles
      gates={gates}
      save={(type, required) => setDealReviewGate({ dealId, type, required })}
    />
  );
}

export function TeamReviewGate({
  accountId,
  gates,
}: {
  accountId: string;
  gates: Gates;
}) {
  return (
    <GateToggles
      gates={gates}
      save={(type, required) =>
        setTeamReviewGate({ accountId, type, required })
      }
    />
  );
}
