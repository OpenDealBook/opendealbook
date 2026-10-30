import Link from 'next/link';

import { Badge } from '@odb/ui/badge';

import {
  AGENDA_SECTIONS,
  type AgendaRow,
  type AgendaSection,
  agendaHref,
} from '../_lib/team-agenda';

const SECTION_TITLE: Record<AgendaSection, string> = {
  overdue: 'Overdue',
  due_soon: 'Due in the next 7 days',
  approval: 'Waiting on your approval',
  activity: 'New since your last visit',
  deadline: 'Deadlines in the next 14 days',
  quiet_lender: 'Lenders gone quiet',
  signoff: 'Counsel sign-offs pending',
};

const COUNSEL: Record<string, string> = {
  buyer: "Buyer's counsel",
  seller: "Seller's counsel",
};

const VERDICT: Record<string, string> = {
  approved: 'Approved',
  changes_needed: 'Changes needed',
  approved_with_comments: 'Approved with comments',
};

const MILESTONE: Record<string, string> = {
  loi_deadline: 'LOI deadline',
  financing_contingency: 'Financing contingency',
  closing: 'Closing',
  exclusivity_end: 'Exclusivity ends',
};

function summary(row: AgendaRow): string {
  switch (row.kind) {
    case 'todo':
    case 'checklist':
      return row.title!;
    case 'deal_update':
      return `Update to send: ${row.title}`;
    case 'seller_upload':
      return `Seller uploaded ${row.title}`;
    case 'seller_answer':
      return `Seller answered: ${row.title}`;
    case 'lender_ask':
      return `Lender request: ${row.title}`;
    case 'lender_form':
      return `Lender form: ${row.title}`;
    case 'counsel_message':
      return `${COUNSEL[row.detail!]}: ${row.title}`;
    case 'counsel_decision':
      return `${COUNSEL[row.detail!]}: ${VERDICT[row.title!]}`;
    case 'milestone':
      return MILESTONE[row.detail!]!;
    case 'must_close_by':
      return row.detail === null
        ? 'Must close by'
        : `Must close by: ${row.detail}`;
    case 'quiet_lender':
      return `${row.title}, quiet ${row.detail} days`;
    case 'signoff':
      return `${row.title!.toUpperCase()} sign-off from ${COUNSEL[row.detail!]!.toLowerCase()}`;
  }
}

function shortDate(at: string) {
  return new Date(at).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  });
}

function ScopeToggle({ wholeTeam }: { wholeTeam: boolean }) {
  const options = [
    { label: 'Mine', href: '?scope=mine', current: !wholeTeam },
    { label: 'Whole team', href: '?scope=team', current: wholeTeam },
  ];

  return (
    <nav
      aria-label={'Agenda scope'}
      className={'bg-muted flex rounded-md p-0.5'}
    >
      {options.map((option) => (
        <Link
          key={option.label}
          href={option.href}
          aria-current={option.current ? 'page' : undefined}
          className={
            option.current
              ? 'bg-background rounded px-3 py-1 text-sm font-medium shadow-sm'
              : 'text-muted-foreground hover:text-foreground rounded px-3 py-1 text-sm'
          }
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}

export function TeamAgenda(props: {
  account: string;
  rows: AgendaRow[];
  wholeTeam: boolean | null;
  showsLenders: boolean;
}) {
  const sections = AGENDA_SECTIONS.map((section) => ({
    section,
    rows: props.rows.filter((row) => row.section === section),
  })).filter((group) => group.rows.length > 0);

  return (
    <div className={'flex max-w-5xl flex-col gap-8'}>
      <div className={'flex flex-wrap items-center justify-between gap-4'}>
        <h1 className={'text-2xl font-semibold'}>Today</h1>
        {props.wholeTeam === null ? null : (
          <ScopeToggle wholeTeam={props.wholeTeam} />
        )}
      </div>

      {sections.length === 0 ? (
        <p className={'text-muted-foreground'}>Nothing needs you today.</p>
      ) : null}

      {sections.map((group) => (
        <section key={group.section} className={'flex flex-col gap-2'}>
          <h2
            className={
              group.section === 'overdue'
                ? 'text-destructive text-sm font-semibold'
                : 'text-sm font-semibold'
            }
          >
            {SECTION_TITLE[group.section]}
          </h2>
          <ul className={'divide-y rounded-md border'}>
            {group.rows.map((row) => (
              <li key={`${row.kind}-${row.item_id}-${row.detail}`}>
                <Link
                  href={agendaHref(props.account, row, props.showsLenders)}
                  className={
                    'hover:bg-muted/50 grid gap-x-4 gap-y-0.5 px-4 py-2.5 text-sm md:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,14rem)]'
                  }
                >
                  <span className={'text-muted-foreground tabular-nums'}>
                    {shortDate(row.at)}
                  </span>
                  <span className={'line-clamp-2'}>
                    {summary(row)}
                    {row.lapsed ? (
                      <Badge variant={'destructive'} className={'ml-2'}>
                        Lapsed
                      </Badge>
                    ) : null}
                  </span>
                  <span
                    title={row.deal_name ?? undefined}
                    className={'text-muted-foreground truncate md:text-right'}
                  >
                    {row.deal_name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
