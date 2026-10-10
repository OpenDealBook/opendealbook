'use client';

import * as React from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/select';

type StatusValue = 'not_started' | 'requested' | 'received' | 'reviewed';

const STATUS_OPTIONS: { value: StatusValue; label: string }[] = [
  { value: 'not_started', label: 'Not started' },
  { value: 'requested', label: 'Requested' },
  { value: 'received', label: 'Received' },
  { value: 'reviewed', label: 'Reviewed' },
];

const statusStyles: Record<StatusValue, string> = {
  not_started: 'text-muted-foreground',
  requested: 'bg-brass/10 text-brass',
  received: 'bg-warning/10 text-warning',
  reviewed: 'bg-success/10 text-success',
};

function StatusDropdown({
  value,
  onChange,
  disabled,
}: {
  value: StatusValue;
  onChange: (value: StatusValue) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as StatusValue)}
      disabled={disabled}
    >
      <SelectTrigger
        data-slot="status-dropdown"
        data-status={value}
        className={statusStyles[value]}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUS_OPTIONS.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            data-status={option.value}
            className={statusStyles[option.value]}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export { StatusDropdown, statusStyles };
export type { StatusValue };
