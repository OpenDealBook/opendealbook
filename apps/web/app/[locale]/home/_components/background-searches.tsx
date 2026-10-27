import type { ReactNode } from 'react';

import Link from 'next/link';

import { plainDate } from '@odb/shared/utils';
import type { Enums, Tables } from '@odb/supabase';
import { UNFINISHED_RUN_STATUSES } from '@odb/workflows/builder/client';

import { WorkflowRunStatus, workflowTime } from './workflow-run-status';

export type BackgroundFinding = Pick<
  Tables<'diligence_finding'>,
  | 'id'
  | 'subject_kind'
  | 'subject_name'
  | 'source'
  | 'severity'
  | 'severity_reason'
  | 'title'
  | 'source_url'
  | 'occurred_on'
>;

export interface BackgroundSearch {
  id: string;
  status: Enums<'workflow_run_status'>;
  error: string | null;
  started_at: string;
  skipped: string[];
  report: Pick<Tables<'diligence_report'>, 'summary' | 'created_at'> | null;
  findings: BackgroundFinding[];
}

type Group = Enums<'diligence_severity'> | 'unrated';

const GROUPS: { severity: Group; label: string; rule: string; text: string }[] =
  [
    {
      severity: 'red',
      label: 'Red',
      rule: 'border-destructive',
      text: 'text-destructive',
    },
    {
      severity: 'amber',
      label: 'Amber',
      rule: 'border-warning',
      text: 'text-warning',
    },
    {
      severity: 'green',
      label: 'Green',
      rule: 'border-success',
      text: 'text-success',
    },
    {
      severity: 'unrated',
      label: 'Not rated',
      rule: 'border-border',
      text: 'text-muted-foreground',
    },
  ];

const SOURCES: Record<Enums<'diligence_source'>, string> = {
  courts: 'Courts',
  sanctions: 'Sanctions',
  news: 'News',
  reviews: 'Reviews',
};

function when(timestamp: string) {
  return workflowTime.format(new Date(timestamp));
}

export function BackgroundSearches({
  searches,
  selected,
  basePath,
  runAgain,
}: {
  searches: BackgroundSearch[];
  selected: string | undefined;
  basePath: string;
  runAgain: ReactNode;
}) {
  const shown =
    searches.find((search) => search.id === selected) ?? searches[0];

  return (
    <div className={'flex max-w-4xl flex-col gap-8'}>
      <header className={'flex flex-wrap items-start justify-between gap-4'}>
        <div className={'flex flex-col gap-1'}>
          <div className={'flex items-center gap-3'}>
            <h2 className={'text-xl font-semibold tracking-tight'}>
              Background search
            </h2>
            {shown ? <WorkflowRunStatus status={shown.status} /> : null}
          </div>
          {shown ? (
            <p className={'text-muted-foreground text-sm'}>
              {shown.report
                ? `Report written ${when(shown.report.created_at)}`
                : `Started ${when(shown.started_at)}`}
            </p>
          ) : null}
        </div>
        {runAgain}
      </header>

      {shown ? (
        <SearchReport search={shown} />
      ) : (
        <div className={'border-border rounded-lg border border-dashed p-8'}>
          <p className={'font-medium'}>No background search yet</p>
          <p className={'text-muted-foreground mt-1 max-w-prose text-sm'}>
            The search runs when the LOI is signed, or when a deal manager
            selects Run again.
          </p>
        </div>
      )}

      {searches.length > 1 ? (
        <nav
          aria-labelledby={'background-history'}
          className={'flex flex-col gap-2'}
        >
          <h2 id={'background-history'} className={'text-sm font-semibold'}>
            Report history
          </h2>
          <ul
            className={'divide-border border-border divide-y rounded-lg border'}
          >
            {searches.map((search) => (
              <li key={search.id}>
                <Link
                  href={`${basePath}?search=${search.id}`}
                  aria-current={search === shown ? 'page' : undefined}
                  className={
                    'hover:bg-muted/60 aria-[current]:bg-muted flex items-center justify-between gap-4 px-4 py-2.5 text-sm'
                  }
                >
                  <span>{when(search.started_at)}</span>
                  <WorkflowRunStatus status={search.status} />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}

function SearchReport({ search }: { search: BackgroundSearch }) {
  return (
    <div className={'flex flex-col gap-8'}>
      <div className={'flex flex-col gap-4'}>
        {search.report ? (
          <p className={'max-w-prose leading-relaxed'}>
            {search.report.summary}
          </p>
        ) : (
          <p className={'text-muted-foreground max-w-prose text-sm'}>
            {!UNFINISHED_RUN_STATUSES.some((status) => status === search.status)
              ? ['The report was not written.', search.error]
                  .filter(Boolean)
                  .join(' ')
              : 'The search is still in progress. Reload the page to see the report once it is written.'}
          </p>
        )}
        {search.skipped.length > 0 ? (
          <div className={'bg-muted/50 rounded-md px-4 py-3 text-sm'}>
            <p className={'font-medium'}>Not searched</p>
            <ul className={'text-muted-foreground mt-1 list-disc pl-5'}>
              {search.skipped.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {GROUPS.map((group) => {
        const findings = search.findings.filter(
          (finding) => (finding.severity ?? 'unrated') === group.severity,
        );

        return findings.length > 0 ? (
          <section
            key={group.severity}
            data-severity={group.severity}
            className={`flex flex-col gap-3 border-l-4 pl-4 ${group.rule}`}
          >
            <h3 className={'text-base font-semibold'}>
              {group.label} ({findings.length})
            </h3>
            <ul className={'flex flex-col gap-5'}>
              {findings.map((finding) => (
                <li key={finding.id} className={'flex flex-col gap-1'}>
                  <p className={'flex flex-wrap items-baseline gap-x-2'}>
                    <span className={`text-xs font-semibold ${group.text}`}>
                      {group.label}
                    </span>
                    <span className={'font-medium'}>{finding.title}</span>
                  </p>
                  <p
                    className={
                      'text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm'
                    }
                  >
                    <span>
                      {finding.subject_name}, {finding.subject_kind}
                    </span>
                    <span>{SOURCES[finding.source]}</span>
                    {finding.occurred_on ? (
                      <span>{plainDate(finding.occurred_on)}</span>
                    ) : null}
                  </p>
                  {finding.severity_reason ? (
                    <p className={'max-w-prose text-sm'}>
                      {finding.severity_reason}
                    </p>
                  ) : null}
                  <a
                    href={finding.source_url}
                    target={'_blank'}
                    rel={'noopener noreferrer'}
                    className={
                      'self-start text-sm underline underline-offset-4'
                    }
                  >
                    View source
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null;
      })}
    </div>
  );
}
