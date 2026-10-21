'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import type { LenderHistoryRow } from '@odb/lender-rooms/crm/history/lender-history.ts';
import { deleteLender } from '@odb/lender-rooms/crm/lenders/actions.ts';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';

import { countWording } from '../lender-wording';
import { ConfirmButton } from './confirm-button';
import { LenderContacts } from './lender-contacts';
import { LenderFormDialog } from './lender-form';
import { LenderHistory } from './lender-history';
import { RATE_TYPE_WORDING, type SavedLender, dollars } from './saved-lender';

type RateType = keyof typeof RATE_TYPE_WORDING;

const LIST_FILTERS = [
  { column: 'tags', label: 'Tag', emptyMeansAny: false },
  { column: 'industries', label: 'Industry', emptyMeansAny: true },
  { column: 'states', label: 'State', emptyMeansAny: true },
] as const;

type ListColumn = (typeof LIST_FILTERS)[number]['column'];

interface Filter {
  chosen: Record<ListColumn, string[]>;
  rateType: RateType | null;
  sbaOnly: boolean;
  loanSize: number | null;
}

function matches(lender: SavedLender, filter: Filter) {
  return (
    LIST_FILTERS.every(
      ({ column, emptyMeansAny }) =>
        filter.chosen[column].length === 0 ||
        (emptyMeansAny && lender[column].length === 0) ||
        filter.chosen[column].some((value) => lender[column].includes(value)),
    ) &&
    (filter.rateType === null ||
      lender.rate_type === filter.rateType ||
      (filter.rateType !== 'either' && lender.rate_type === 'either')) &&
    (!filter.sbaOnly || lender.sba_preferred) &&
    (filter.loanSize === null ||
      lender.max_loan === null ||
      lender.max_loan >= filter.loanSize)
  );
}

function Chip({
  label,
  pressed,
  onPress,
}: {
  label: string;
  pressed: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      type={'button'}
      size={'sm'}
      variant={pressed ? 'default' : 'outline'}
      aria-pressed={pressed}
      onClick={onPress}
    >
      {label}
    </Button>
  );
}

function termsOf(lender: SavedLender) {
  return [
    lender.rate_type && `${RATE_TYPE_WORDING[lender.rate_type]} rate`,
    lender.typical_rate !== null && `Typically ${lender.typical_rate}%`,
    lender.max_loan !== null && `Loans up to ${dollars(lender.max_loan)}`,
    lender.sba_preferred && 'Prefers SBA',
    lender.industries.length > 0 && lender.industries.join(', '),
    lender.states.length > 0 && lender.states.join(', '),
  ].filter((term): term is string => typeof term === 'string');
}

function LenderRow({
  accountId,
  teamPath,
  lender,
  history,
}: {
  accountId: string;
  teamPath: string;
  lender: SavedLender;
  history: LenderHistoryRow[];
}) {
  const router = useRouter();
  const hasPrimary = lender.lender_contact.some(
    (contact) => contact.is_primary,
  );

  return (
    <li className={'flex flex-col gap-4 p-5'}>
      <div className={'flex flex-wrap items-start justify-between gap-3'}>
        <div className={'flex min-w-0 flex-col gap-1'}>
          <h3 className={'font-serif text-lg font-medium'}>{lender.name}</h3>
          <span className={'text-muted-foreground text-sm'}>
            {lender.website}
          </span>
          <ul className={'flex flex-wrap gap-x-4 gap-y-1 text-sm'}>
            {termsOf(lender).map((term) => (
              <li key={term}>{term}</li>
            ))}
          </ul>
          {lender.tags.length > 0 ? (
            <div className={'flex flex-wrap gap-1'}>
              {lender.tags.map((tag) => (
                <Badge key={tag} variant={'secondary'}>
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
          {hasPrimary ? null : (
            <p className={'text-destructive text-sm'}>
              No primary contact. Set one to create rooms for this lender.
            </p>
          )}
          {lender.notes ? (
            <p className={'text-muted-foreground max-w-prose text-sm'}>
              {lender.notes}
            </p>
          ) : null}
        </div>
        <div className={'flex items-center gap-2'}>
          <LenderFormDialog accountId={accountId} lender={lender} />
          <ConfirmButton
            label={`Delete ${lender.name}`}
            title={`Delete ${lender.name}?`}
            description={
              'This removes the lender and its contacts from your saved lenders. Its deal rooms stay.'
            }
            confirmLabel={'Delete lender'}
            action={() => deleteLender({ lenderId: lender.id })}
            onDone={() => router.refresh()}
          >
            Delete
          </ConfirmButton>
        </div>
      </div>
      <LenderContacts lender={lender} />
      <details className={'group'}>
        <summary className={'cursor-pointer text-sm font-medium'}>
          History ({countWording(history.length, 'room', 'rooms')})
        </summary>
        <div className={'mt-2'}>
          <LenderHistory rows={history} teamPath={teamPath} />
        </div>
      </details>
    </li>
  );
}

export function LenderDirectory({
  accountId,
  teamPath,
  lenders,
  histories,
}: {
  accountId: string;
  teamPath: string;
  lenders: SavedLender[];
  histories: Record<string, LenderHistoryRow[]>;
}) {
  const [filter, setFilter] = useState<Filter>({
    chosen: { tags: [], industries: [], states: [] },
    rateType: null,
    sbaOnly: false,
    loanSize: null,
  });
  const [loanSizeText, setLoanSizeText] = useState('');
  const shown = lenders.filter((lender) => matches(lender, filter));

  return (
    <section className={'flex flex-col gap-4'}>
      <div className={'flex items-center justify-between gap-4'}>
        <h2 className={'font-serif text-2xl font-medium'}>Saved lenders</h2>
        <LenderFormDialog accountId={accountId} />
      </div>
      {lenders.length === 0 ? (
        <p
          className={
            'text-muted-foreground rounded-xl border border-dashed p-8 text-sm'
          }
        >
          No saved lenders yet. Save the lenders your team works with, then set
          up rooms and draft outreach from any deal.
        </p>
      ) : (
        <>
          <div
            className={
              'bg-muted/40 flex flex-col gap-3 rounded-xl border p-4 text-sm'
            }
          >
            {LIST_FILTERS.map(({ column, label }) => {
              const values = [
                ...new Set(lenders.flatMap((lender) => lender[column])),
              ].sort();
              const chosen = filter.chosen[column];

              return values.length > 0 ? (
                <div
                  key={column}
                  className={'flex flex-wrap items-center gap-2'}
                >
                  <span className={'text-muted-foreground w-24'}>{label}</span>
                  {values.map((value) => (
                    <Chip
                      key={value}
                      label={value}
                      pressed={chosen.includes(value)}
                      onPress={() =>
                        setFilter({
                          ...filter,
                          chosen: {
                            ...filter.chosen,
                            [column]: chosen.includes(value)
                              ? chosen.filter((each) => each !== value)
                              : [...chosen, value],
                          },
                        })
                      }
                    />
                  ))}
                </div>
              ) : null;
            })}
            <div className={'flex flex-wrap items-center gap-2'}>
              <span className={'text-muted-foreground w-24'}>Rate type</span>
              {(Object.keys(RATE_TYPE_WORDING) as RateType[]).map((rate) => (
                <Chip
                  key={rate}
                  label={RATE_TYPE_WORDING[rate]}
                  pressed={filter.rateType === rate}
                  onPress={() =>
                    setFilter({
                      ...filter,
                      rateType: filter.rateType === rate ? null : rate,
                    })
                  }
                />
              ))}
            </div>
            <div className={'flex flex-wrap items-center gap-6'}>
              <div className={'flex items-center gap-2'}>
                <Label htmlFor={'lender-filter-loan'} className={'w-24'}>
                  Loan size ($)
                </Label>
                <Input
                  id={'lender-filter-loan'}
                  type={'number'}
                  className={'w-40'}
                  value={loanSizeText}
                  onChange={(event) => {
                    setLoanSizeText(event.target.value);
                    setFilter({
                      ...filter,
                      loanSize:
                        event.target.value.trim() === ''
                          ? null
                          : Number(event.target.value),
                    });
                  }}
                />
              </div>
              <label className={'flex items-center gap-2'}>
                <input
                  type={'checkbox'}
                  className={'accent-primary size-4'}
                  checked={filter.sbaOnly}
                  onChange={(event) =>
                    setFilter({ ...filter, sbaOnly: event.target.checked })
                  }
                />
                Only lenders that prefer SBA
              </label>
            </div>
          </div>
          {shown.length === 0 ? (
            <p className={'text-muted-foreground text-sm'}>
              No saved lenders match these filters.
            </p>
          ) : (
            <ul
              aria-label={'Saved lenders'}
              className={'bg-card divide-y rounded-xl border'}
            >
              {shown.map((lender) => (
                <LenderRow
                  key={lender.id}
                  accountId={accountId}
                  teamPath={teamPath}
                  lender={lender}
                  history={histories[lender.id]!}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
