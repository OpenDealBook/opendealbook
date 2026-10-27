import Link from 'next/link';

import type { Enums } from '@odb/supabase';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import { Input } from '@odb/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

type LeadSource = Enums<'lead_source'>;

export interface LeadRow {
  firmId: string;
  name: string;
  city: string | null;
  state: string | null;
  jobs: number | null;
  pppLoanAmount: number | null;
  headcount: number | null;
  businessAgeYears: number | null;
  sources: LeadSource[];
  needsReview: boolean;
  verdict: 'fit' | 'not_fit' | null;
  approval: keyof typeof APPROVAL_LABELS | null;
  emailCount: number;
  outreach: keyof typeof OUTREACH_LABELS;
}

export interface LeadFilters {
  verdict: string;
  source: string;
  state: string;
  q: string;
}

export const SOURCE_LABELS: Record<LeadSource, string> = {
  ppp: 'PPP',
  sba_7a: 'SBA 7(a)',
  sba_504: 'SBA 504',
  form_5500: 'Form 5500',
  state_registry: 'State registry',
};

const VERDICT_LABELS = { fit: 'Fit', not_fit: 'Not a fit' } as const;

const APPROVAL_LABELS = {
  approved: 'Approved',
  overridden: 'Overridden',
  revoked: 'Revoked',
  awaiting_approval: 'Awaiting approval',
  rejected: 'Rejected',
} as const;

const OUTREACH_LABELS = {
  not_started: 'Not started',
  awaiting_approval: 'Awaiting approval',
  sending: 'Sending',
  done: 'Done',
  replied: 'Replied',
  bounced: 'Bounced',
  stopped: 'Stopped',
} as const;

const selectClass = 'bg-background h-9 rounded-md border px-2 text-sm';

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function hrefFor(basePath: string, filters: LeadFilters, page: number) {
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value !== ''),
  );

  if (page > 1) {
    query.set('page', String(page));
  }

  const search = query.toString();

  return search ? `${basePath}?${search}` : basePath;
}

function sizeSignals(row: LeadRow): string[] {
  return [
    row.jobs === null ? null : `${row.jobs} jobs`,
    row.pppLoanAmount === null
      ? null
      : `${money.format(row.pppLoanAmount)} PPP loan`,
    row.headcount === null ? null : `${row.headcount} on Form 5500`,
    row.businessAgeYears === null ? null : `${row.businessAgeYears} years old`,
  ].filter((signal) => signal !== null);
}

export function LeadsPipeline({
  rows,
  total,
  page,
  pageSize,
  filters,
  stateOptions,
  basePath,
  workflowsHref,
  approvalsHref,
}: {
  rows: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
  filters: LeadFilters;
  stateOptions: string[];
  basePath: string;
  workflowsHref: string;
  approvalsHref: string | null;
}) {
  const filtered = Object.values(filters).some((value) => value !== '');

  if (total === 0 && !filtered) {
    return (
      <div className={'flex flex-col items-start gap-3 rounded-md border p-6'}>
        <p className={'text-muted-foreground max-w-prose text-sm'}>
          No leads yet. Firms land here when a workflow pulls them from public
          records such as PPP and SBA loans, Form 5500 filings and state
          registries.
        </p>
        <Button asChild variant={'outline'} size={'sm'}>
          <Link href={workflowsHref}>Open Workflows</Link>
        </Button>
      </div>
    );
  }

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className={'flex min-w-0 flex-col gap-4'}>
      <form
        method={'get'}
        action={basePath}
        className={'flex flex-wrap items-end gap-2'}
      >
        <Input
          name={'q'}
          defaultValue={filters.q}
          placeholder={'Search by firm name'}
          aria-label={'Search by firm name'}
          className={'h-9 w-full sm:w-64'}
        />
        <select
          name={'verdict'}
          aria-label={'Verdict'}
          defaultValue={filters.verdict}
          className={selectClass}
        >
          <option value={''}>Any verdict</option>
          <option value={'fit'}>Fit</option>
          <option value={'not_fit'}>Not a fit</option>
          <option value={'none'}>No verdict</option>
        </select>
        <select
          name={'source'}
          aria-label={'Source'}
          defaultValue={filters.source}
          className={selectClass}
        >
          <option value={''}>Any source</option>
          {Object.entries(SOURCE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          name={'state'}
          aria-label={'State'}
          defaultValue={filters.state}
          className={selectClass}
        >
          <option value={''}>Any state</option>
          {stateOptions.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </select>
        <Button type={'submit'} size={'sm'} className={'h-9'}>
          Apply
        </Button>
      </form>

      {total === 0 ? (
        <div
          className={'flex flex-col items-start gap-3 rounded-md border p-6'}
        >
          <p className={'text-muted-foreground text-sm'}>
            No firms match these filters.
          </p>
          <Button asChild variant={'outline'} size={'sm'}>
            <Link href={basePath}>Clear filters</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className={'rounded-md border'}>
            <Table className={'min-w-[960px]'}>
              <TableHeader>
                <TableRow>
                  <TableHead>Firm</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Size signals</TableHead>
                  <TableHead>Sources</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Verdict</TableHead>
                  <TableHead className={'text-right'}>Emails found</TableHead>
                  <TableHead>Outreach</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <LeadTableRow
                    key={row.firmId}
                    row={row}
                    approvalsHref={approvalsHref}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          <nav
            aria-label={'Pages'}
            className={'flex flex-wrap items-center justify-between gap-2'}
          >
            <p className={'text-muted-foreground text-sm'}>
              Showing {first} to {last} of {total} firms
            </p>
            <div className={'flex gap-2'}>
              {page > 1 ? (
                <Button asChild variant={'outline'} size={'sm'}>
                  <Link href={hrefFor(basePath, filters, page - 1)}>
                    Previous page
                  </Link>
                </Button>
              ) : null}
              {last < total ? (
                <Button asChild variant={'outline'} size={'sm'}>
                  <Link href={hrefFor(basePath, filters, page + 1)}>
                    Next page
                  </Link>
                </Button>
              ) : null}
            </div>
          </nav>
        </>
      )}
    </div>
  );
}

function LeadTableRow({
  row,
  approvalsHref,
}: {
  row: LeadRow;
  approvalsHref: string | null;
}) {
  const signals = sizeSignals(row);

  return (
    <TableRow className={'align-top'}>
      <TableCell className={'font-medium'}>{row.name}</TableCell>
      <TableCell>
        {row.city || row.state ? (
          [row.city, row.state].filter(Boolean).join(', ')
        ) : (
          <span className={'text-muted-foreground'}>Unknown</span>
        )}
      </TableCell>
      <TableCell>
        {signals.length > 0 ? (
          <ul className={'flex flex-col gap-0.5'}>
            {signals.map((signal) => (
              <li key={signal}>{signal}</li>
            ))}
          </ul>
        ) : (
          <span className={'text-muted-foreground'}>None yet</span>
        )}
      </TableCell>
      <TableCell>
        {row.sources.length > 0 ? (
          <ul className={'flex flex-wrap gap-1'}>
            {row.sources.map((source) => (
              <li key={source}>
                <Badge variant={'outline'}>{SOURCE_LABELS[source]}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <span className={'text-muted-foreground'}>None yet</span>
        )}
      </TableCell>
      <TableCell>
        {row.needsReview ? (
          <Badge variant={'secondary'}>Needs review</Badge>
        ) : (
          'Matched'
        )}
      </TableCell>
      <TableCell>
        {row.verdict === null ? (
          <span className={'text-muted-foreground'}>No verdict</span>
        ) : (
          <span className={'flex flex-col items-start gap-1'}>
            <span>{VERDICT_LABELS[row.verdict]}</span>
            {row.approval === 'awaiting_approval' && approvalsHref ? (
              <Link
                href={approvalsHref}
                className={'text-xs underline underline-offset-2'}
              >
                {APPROVAL_LABELS[row.approval]}
              </Link>
            ) : (
              <span className={'text-muted-foreground text-xs'}>
                {row.approval ? APPROVAL_LABELS[row.approval] : null}
              </span>
            )}
          </span>
        )}
      </TableCell>
      <TableCell className={'text-right tabular-nums'}>
        {row.emailCount}
      </TableCell>
      <TableCell>{OUTREACH_LABELS[row.outreach]}</TableCell>
    </TableRow>
  );
}
