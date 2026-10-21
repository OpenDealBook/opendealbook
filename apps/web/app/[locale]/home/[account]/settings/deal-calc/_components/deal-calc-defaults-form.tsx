'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { afterStandbySchema, yearBasisKindSchema } from '@odb/calculators';
import { Button } from '@odb/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { Label } from '@odb/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@odb/ui/select';

import {
  AFTER_STANDBY_LABELS,
  NumberField,
  YEAR_BASIS_LABELS,
  num,
  scenarioPathDriversFrom,
  scenarioPathsDraft,
} from '../../../../_components/calc-shared';
import { GatedControl } from '../../../../_components/gated-control';
import { PathDriversSection } from '../../../../_components/path-drivers-section';
import type { DealCalcDefaults } from '../../../../_lib/deal-calc-defaults';
import { saveDealCalcDefaultsAction } from '../actions';

function ChoiceField<Value extends string>(props: {
  label: string;
  choices: { options: readonly Value[]; parse: (value: unknown) => Value };
  labels: Record<Value, string>;
  value: Value;
  onChange: (value: Value) => void;
}) {
  return (
    <div className={'flex flex-col gap-1'}>
      <Label>{props.label}</Label>
      <Select
        value={props.value}
        onValueChange={(value) => props.onChange(props.choices.parse(value))}
      >
        <SelectTrigger className={'w-64'}>
          <SelectValue>{props.labels[props.value]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {props.choices.options.map((value) => (
            <SelectItem key={value} value={value}>
              {props.labels[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function DealCalcDefaultsForm(props: {
  accountId: string;
  defaults: DealCalcDefaults;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [afterStandby, setAfterStandby] = useState(props.defaults.afterStandby);
  const [yearBasis, setYearBasis] = useState(props.defaults.yearBasis);
  const [minimumDscr, setMinimumDscr] = useState(
    String(props.defaults.minimumDscr),
  );
  const [paths, setPaths] = useState(
    scenarioPathsDraft(props.defaults.scenarioPaths),
  );

  function save() {
    startTransition(async () => {
      await saveDealCalcDefaultsAction({
        accountId: props.accountId,
        after_standby: afterStandby,
        year_basis: yearBasis,
        scenario_paths: scenarioPathDriversFrom(paths),
        minimum_dscr: num(minimumDscr),
      });
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New deal calcs</CardTitle>
      </CardHeader>
      <CardContent>
        <GatedControl
          allowed={props.canManage}
          reason={
            'Only team owners and admins can change the deal calc defaults.'
          }
        >
          <div className={'flex flex-col gap-4'}>
            <ChoiceField
              label={'Year basis'}
              choices={yearBasisKindSchema}
              labels={YEAR_BASIS_LABELS}
              value={yearBasis}
              onChange={setYearBasis}
            />
            <ChoiceField
              label={'After standby, for new loans'}
              choices={afterStandbySchema}
              labels={AFTER_STANDBY_LABELS}
              value={afterStandby}
              onChange={setAfterStandby}
            />
            <div className={'flex flex-col gap-1'}>
              <Label>Minimum DSCR</Label>
              <NumberField
                value={minimumDscr}
                placeholder={'1.25'}
                onChange={setMinimumDscr}
              />
            </div>
            <PathDriversSection
              title={'Worst path'}
              drivers={paths.worst}
              onChange={(worst) => setPaths({ ...paths, worst })}
            />
            <PathDriversSection
              title={'Great path'}
              drivers={paths.great}
              onChange={(great) => setPaths({ ...paths, great })}
            />
            <div>
              <Button size={'sm'} disabled={pending} onClick={save}>
                Save
              </Button>
            </div>
          </div>
        </GatedControl>
      </CardContent>
    </Card>
  );
}
