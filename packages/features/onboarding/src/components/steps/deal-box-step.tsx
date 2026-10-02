'use client';

import { useState } from 'react';

import { Button } from '@odb/ui/button';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';

import {
  dealBoxStepSchema,
  type DealBoxStep,
} from '../../schema/onboarding.schema';

function toList(value: string): string[] | undefined {
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}

function toNumber(value: string): number | undefined {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) ? parsed : undefined;
}

export function DealBoxStepForm(props: {
  value?: DealBoxStep;
  onSubmit: (value: DealBoxStep) => void;
  onBack?: () => void;
  onSkip?: () => void;
}) {
  const criteria = props.value?.criteria;
  const [naics, setNaics] = useState((criteria?.naics ?? []).join(', '));
  const [industries, setIndustries] = useState(
    (criteria?.industries ?? []).join(', '),
  );
  const [states, setStates] = useState((criteria?.states ?? []).join(', '));
  const [minRevenue, setMinRevenue] = useState(
    criteria?.minRevenue?.toString() ?? '',
  );
  const [maxAskingPrice, setMaxAskingPrice] = useState(
    criteria?.maxAskingPrice?.toString() ?? '',
  );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit(
          dealBoxStepSchema.parse({
            criteria: {
              naics: toList(naics),
              industries: toList(industries),
              states: toList(states),
              minRevenue: toNumber(minRevenue),
              maxAskingPrice: toNumber(maxAskingPrice),
            },
          }),
        );
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="deal-box-naics">Target NAICS codes</Label>
        <Input
          id="deal-box-naics"
          value={naics}
          onChange={(event) => setNaics(event.target.value)}
          placeholder="541211, 621111"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="deal-box-industries">Industries</Label>
        <Input
          id="deal-box-industries"
          value={industries}
          onChange={(event) => setIndustries(event.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="deal-box-states">States</Label>
        <Input
          id="deal-box-states"
          value={states}
          onChange={(event) => setStates(event.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="deal-box-min-revenue">Minimum revenue</Label>
        <Input
          id="deal-box-min-revenue"
          inputMode="numeric"
          value={minRevenue}
          onChange={(event) => setMinRevenue(event.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="deal-box-max-price">Maximum asking price</Label>
        <Input
          id="deal-box-max-price"
          inputMode="numeric"
          value={maxAskingPrice}
          onChange={(event) => setMaxAskingPrice(event.target.value)}
        />
      </div>

      <div className="flex gap-2">
        {props.onBack ? (
          <Button type="button" variant="ghost" onClick={props.onBack}>
            Back
          </Button>
        ) : null}
        {props.onSkip ? (
          <Button type="button" variant="outline" onClick={props.onSkip}>
            Skip for now
          </Button>
        ) : null}
        <Button type="submit">Continue</Button>
      </div>
    </form>
  );
}
