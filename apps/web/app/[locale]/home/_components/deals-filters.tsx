'use client';

import { useEffect, useState } from 'react';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import type { DealListFilters, DealSort } from '@odb/deals';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import { Checkbox } from '@odb/ui/checkbox';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@odb/ui/select';

import { DEAL_PARAM } from './deals-search-params';

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

interface RangeControl {
  label: string;
  minKey: string;
  maxKey: string;
  undisclosedKey: string;
  min?: number;
  max?: number;
  includeUndisclosed: boolean;
}

const SORT_OPTIONS: { value: DealSort; label: string }[] = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'created', label: 'Recently created' },
  { value: 'stage', label: 'Stage' },
  { value: 'asking_price', label: 'Asking price' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'sde', label: 'SDE' },
  { value: 'multiple', label: 'Multiple' },
  { value: 'margin', label: 'Margin' },
  { value: 'days_in_stage', label: 'Days in stage' },
];

export function DealsFilters(props: {
  filters: DealListFilters;
  sort: DealSort;
  stageOptions: FilterOption[];
  resolutionOptions: FilterOption[];
  listingStatusOptions: FilterOption[];
  industryOptions: FilterOption[];
  locationOptions: FilterOption[];
  starredCount: number;
  archivedCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(props.filters.q ?? '');

  function commit(next: URLSearchParams) {
    next.delete(DEAL_PARAM.cursor);
    const query = next.toString();
    router.replace(query.length > 0 ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(searchParams);
    if (value === undefined || value.length === 0) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    commit(next);
  }

  function toggleCsv(key: string, value: string) {
    const current = (searchParams.get(key) ?? '')
      .split(',')
      .filter((part) => part.length > 0);
    const next = current.includes(value)
      ? current.filter((part) => part !== value)
      : [...current, value];
    setParam(key, next.join(','));
  }

  useEffect(() => {
    setSearch(props.filters.q ?? '');
  }, [props.filters.q]);

  useEffect(() => {
    const current = searchParams.get(DEAL_PARAM.q) ?? '';
    if (search === current) {
      return;
    }
    const timer = setTimeout(() => setParam(DEAL_PARAM.q, search), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const ranges: RangeControl[] = [
    {
      label: 'Asking',
      minKey: DEAL_PARAM.askingMin,
      maxKey: DEAL_PARAM.askingMax,
      undisclosedKey: DEAL_PARAM.askingUndisclosed,
      min: props.filters.askingMin,
      max: props.filters.askingMax,
      includeUndisclosed: props.filters.askingIncludeUndisclosed === true,
    },
    {
      label: 'Revenue',
      minKey: DEAL_PARAM.revenueMin,
      maxKey: DEAL_PARAM.revenueMax,
      undisclosedKey: DEAL_PARAM.revenueUndisclosed,
      min: props.filters.revenueMin,
      max: props.filters.revenueMax,
      includeUndisclosed: props.filters.revenueIncludeUndisclosed === true,
    },
    {
      label: 'SDE',
      minKey: DEAL_PARAM.sdeMin,
      maxKey: DEAL_PARAM.sdeMax,
      undisclosedKey: DEAL_PARAM.sdeUndisclosed,
      min: props.filters.sdeMin,
      max: props.filters.sdeMax,
      includeUndisclosed: props.filters.sdeIncludeUndisclosed === true,
    },
  ];

  const chips = buildChips(props);

  return (
    <div className={'flex w-72 shrink-0 flex-col gap-6 text-sm'}>
      <Input
        placeholder={'Search deals'}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      <div className={'flex flex-col gap-2'}>
        <Label>Sort</Label>
        <Select
          value={props.sort}
          onValueChange={(value) => setParam(DEAL_PARAM.sort, value)}
        >
          <SelectTrigger className={'w-full'}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {chips.length > 0 ? (
        <div className={'flex flex-wrap gap-2'}>
          {chips.map((chip) => (
            <Badge
              key={chip.key}
              variant={'secondary'}
              className={'cursor-pointer'}
              onClick={chip.clear(setParam, toggleCsv)}
            >
              {chip.label} x
            </Badge>
          ))}
          <Button
            variant={'ghost'}
            size={'sm'}
            onClick={() => router.replace(pathname, { scroll: false })}
          >
            Clear all
          </Button>
        </div>
      ) : null}

      <CheckboxGroup
        title={'Stage'}
        options={props.stageOptions}
        selected={props.filters.stage ?? []}
        onToggle={(value) => toggleCsv(DEAL_PARAM.stage, value)}
      />

      <CheckboxGroup
        title={'Resolution'}
        options={props.resolutionOptions}
        selected={props.filters.resolution ?? []}
        onToggle={(value) => toggleCsv(DEAL_PARAM.resolution, value)}
      />

      <CheckboxGroup
        title={'Listing status'}
        options={props.listingStatusOptions}
        selected={props.filters.listingStatus ?? []}
        onToggle={(value) => toggleCsv(DEAL_PARAM.listingStatus, value)}
      />

      <FacetSelect
        title={'Industry'}
        placeholder={'Any industry'}
        options={props.industryOptions}
        selected={props.filters.industryId ?? []}
        onChange={(value) => toggleCsv(DEAL_PARAM.industry, value)}
      />

      <FacetSelect
        title={'Location'}
        placeholder={'Any location'}
        options={props.locationOptions}
        selected={props.filters.locationId ?? []}
        onChange={(value) => toggleCsv(DEAL_PARAM.location, value)}
      />

      {ranges.map((range) => (
        <div key={range.label} className={'flex flex-col gap-2'}>
          <Label>{range.label}</Label>
          <div className={'flex gap-2'}>
            <Input
              type={'number'}
              placeholder={'Min'}
              defaultValue={range.min ?? ''}
              onBlur={(event) => setParam(range.minKey, event.target.value)}
            />
            <Input
              type={'number'}
              placeholder={'Max'}
              defaultValue={range.max ?? ''}
              onBlur={(event) => setParam(range.maxKey, event.target.value)}
            />
          </div>
          <label className={'flex items-center gap-2'}>
            <Checkbox
              checked={range.includeUndisclosed}
              onCheckedChange={(checked) =>
                setParam(range.undisclosedKey, checked === true ? '1' : undefined)
              }
            />
            Include undisclosed
          </label>
        </div>
      ))}

      <div className={'flex flex-col gap-2'}>
        <label className={'flex items-center gap-2'}>
          <Checkbox
            checked={props.filters.starred === true}
            onCheckedChange={(checked) =>
              setParam(DEAL_PARAM.starred, checked === true ? '1' : undefined)
            }
          />
          Starred ({props.starredCount})
        </label>
        <label className={'flex items-center gap-2'}>
          <Checkbox
            checked={props.filters.archived === true}
            onCheckedChange={(checked) =>
              setParam(DEAL_PARAM.archived, checked === true ? '1' : undefined)
            }
          />
          Archived ({props.archivedCount})
        </label>
      </div>
    </div>
  );
}

function CheckboxGroup(props: {
  title: string;
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (props.options.length === 0) {
    return null;
  }
  return (
    <div className={'flex flex-col gap-2'}>
      <Label>{props.title}</Label>
      {props.options.map((option) => (
        <label key={option.value} className={'flex items-center gap-2'}>
          <Checkbox
            checked={props.selected.includes(option.value)}
            onCheckedChange={() => props.onToggle(option.value)}
          />
          <span className={'flex-1'}>{option.label}</span>
          <span className={'text-muted-foreground'}>{option.count}</span>
        </label>
      ))}
    </div>
  );
}

function FacetSelect(props: {
  title: string;
  placeholder: string;
  options: FilterOption[];
  selected: string[];
  onChange: (value: string) => void;
}) {
  if (props.options.length === 0) {
    return null;
  }
  return (
    <div className={'flex flex-col gap-2'}>
      <Label>{props.title}</Label>
      <Select value={''} onValueChange={props.onChange}>
        <SelectTrigger className={'w-full'}>
          <SelectValue placeholder={props.placeholder} />
        </SelectTrigger>
        <SelectContent>
          {props.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {props.selected.includes(option.value) ? '✓ ' : ''}
              {option.label} ({option.count})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface Chip {
  key: string;
  label: string;
  clear: (
    setParam: (key: string, value: string | undefined) => void,
    toggleCsv: (key: string, value: string) => void,
  ) => () => void;
}

function buildChips(props: {
  filters: DealListFilters;
  stageOptions: FilterOption[];
  resolutionOptions: FilterOption[];
  listingStatusOptions: FilterOption[];
  industryOptions: FilterOption[];
  locationOptions: FilterOption[];
}): Chip[] {
  const chips: Chip[] = [];
  const labelOf = (options: FilterOption[], value: string) =>
    options.find((option) => option.value === value)?.label ?? value;

  const csvChips = (
    key: string,
    values: string[] | undefined,
    options: FilterOption[],
  ) => {
    for (const value of values ?? []) {
      chips.push({
        key: `${key}:${value}`,
        label: labelOf(options, value),
        clear: (_setParam, toggleCsv) => () => toggleCsv(key, value),
      });
    }
  };

  if (props.filters.q !== undefined) {
    chips.push({
      key: DEAL_PARAM.q,
      label: `Search: ${props.filters.q}`,
      clear: (setParam) => () => setParam(DEAL_PARAM.q, undefined),
    });
  }

  csvChips(DEAL_PARAM.stage, props.filters.stage, props.stageOptions);
  csvChips(
    DEAL_PARAM.resolution,
    props.filters.resolution,
    props.resolutionOptions,
  );
  csvChips(
    DEAL_PARAM.listingStatus,
    props.filters.listingStatus,
    props.listingStatusOptions,
  );
  csvChips(DEAL_PARAM.industry, props.filters.industryId, props.industryOptions);
  csvChips(DEAL_PARAM.location, props.filters.locationId, props.locationOptions);

  const rangeChip = (
    minKey: string,
    maxKey: string,
    label: string,
    min?: number,
    max?: number,
  ) => {
    if (min !== undefined) {
      chips.push({
        key: minKey,
        label: `${label} min ${min}`,
        clear: (setParam) => () => setParam(minKey, undefined),
      });
    }
    if (max !== undefined) {
      chips.push({
        key: maxKey,
        label: `${label} max ${max}`,
        clear: (setParam) => () => setParam(maxKey, undefined),
      });
    }
  };

  rangeChip(
    DEAL_PARAM.askingMin,
    DEAL_PARAM.askingMax,
    'Asking',
    props.filters.askingMin,
    props.filters.askingMax,
  );
  rangeChip(
    DEAL_PARAM.revenueMin,
    DEAL_PARAM.revenueMax,
    'Revenue',
    props.filters.revenueMin,
    props.filters.revenueMax,
  );
  rangeChip(
    DEAL_PARAM.sdeMin,
    DEAL_PARAM.sdeMax,
    'SDE',
    props.filters.sdeMin,
    props.filters.sdeMax,
  );

  if (props.filters.starred === true) {
    chips.push({
      key: DEAL_PARAM.starred,
      label: 'Starred',
      clear: (setParam) => () => setParam(DEAL_PARAM.starred, undefined),
    });
  }
  if (props.filters.archived === true) {
    chips.push({
      key: DEAL_PARAM.archived,
      label: 'Archived',
      clear: (setParam) => () => setParam(DEAL_PARAM.archived, undefined),
    });
  }

  return chips;
}
