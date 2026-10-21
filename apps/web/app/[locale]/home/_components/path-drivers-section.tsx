'use client';

import type { ReactNode } from 'react';

import type { CalcSources } from '@odb/deals/shared';
import { Label } from '@odb/ui/label';

import { CitedField } from './calc-input-sources';
import { NumberField, type PathDriversDraft } from './calc-shared';

const FIELDS: { key: keyof PathDriversDraft; label: string }[] = [
  { key: 'revenue_loss', label: 'Revenue lost at close (%)' },
  { key: 'growth', label: 'Annual growth (%)' },
  { key: 'margin_change', label: 'SDE margin change (pts)' },
  { key: 'rate_shift', label: 'Interest rate shift (%)' },
];

export function PathDriversSection(props: {
  title: string;
  drivers: PathDriversDraft;
  onChange: (drivers: PathDriversDraft) => void;
  citing?: { path: 'worst' | 'great'; sources: CalcSources };
}) {
  const citing = props.citing;

  return (
    <div className={'flex flex-col gap-2'}>
      <h3 className={'text-sm font-semibold'}>{props.title}</h3>
      <div className={'grid grid-cols-2 gap-4 sm:grid-cols-4'}>
        {FIELDS.map((field) => {
          const input: ReactNode = (
            <div className={'flex flex-col gap-1'}>
              <Label>{field.label}</Label>
              <NumberField
                value={props.drivers[field.key]}
                placeholder={'0'}
                onChange={(value) =>
                  props.onChange({ ...props.drivers, [field.key]: value })
                }
              />
            </div>
          );

          return citing === undefined ? (
            <div key={field.key}>{input}</div>
          ) : (
            <CitedField
              key={field.key}
              sources={citing.sources}
              input={{ rowId: null, field: `${citing.path}.${field.key}` }}
              label={`${field.label}, ${props.title}`}
            >
              {input}
            </CitedField>
          );
        })}
      </div>
    </div>
  );
}
