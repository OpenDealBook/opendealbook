'use client';

import * as React from 'react';

import { Input } from '#components/input';
import { Label } from '#components/label';

const INPUT_TYPE: Record<TemplateFieldType, React.HTMLInputTypeAttribute> = {
  text: 'text',
  currency: 'number',
  date: 'date',
  percent: 'number',
  list: 'text',
};

type TemplateFieldType = 'text' | 'currency' | 'date' | 'percent' | 'list';

function TemplateField({
  label,
  type,
  value,
  source,
  required,
  onChange,
}: {
  label: string;
  type: TemplateFieldType;
  value?: string;
  source?: string;
  required?: boolean;
  onChange?: (value: string) => void;
}) {
  const id = React.useId();
  const hintId = `${id}-hint`;

  return (
    <div
      data-slot="template-field"
      data-field-type={type}
      className="flex flex-col gap-1.5"
    >
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span data-slot="template-field-required" aria-hidden="true">
            *
          </span>
        ) : null}
      </Label>
      <Input
        id={id}
        type={INPUT_TYPE[type]}
        value={value}
        required={required}
        aria-describedby={source ? hintId : undefined}
        onChange={(event) => onChange?.(event.target.value)}
      />
      {source ? (
        <span
          id={hintId}
          data-slot="template-field-source"
          className="text-muted-foreground text-xs"
        >
          {source}
        </span>
      ) : null}
    </div>
  );
}

export { TemplateField };
export type { TemplateFieldType };
