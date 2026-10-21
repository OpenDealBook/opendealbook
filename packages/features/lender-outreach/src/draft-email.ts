import type { OutreachTemplate } from './default-template';

export interface OutreachFacts {
  dealName: string;
  contactName: string;
  lenderName: string;
  roomLink: string;
  ourName: string | null;
  teamName: string;
  terms: {
    loanAmount: number | null;
    loanType: string | null;
    termYears: number | null;
    rateType: 'fixed' | 'variable' | 'either' | null;
    sellerNoteAmount: number | null;
  };
  targetCloseDate: string | null;
  mustCloseBy: string | null;
}

const LOAN_TYPE_LABELS: Record<string, string> = {
  sba_7a: 'SBA 7(a)',
  sba_504: 'SBA 504',
  conventional: 'Conventional',
  seller_financing: 'Seller financing',
  cash_equity: 'Cash equity',
  heloc: 'HELOC',
  robs_401k: 'ROBS 401(k)',
  investor_equity: 'Investor equity',
  mezzanine: 'Mezzanine',
  other: 'Other',
};

const RATE_LABELS = {
  fixed: 'fixed',
  variable: 'variable',
  either: 'fixed or variable',
};

const dollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export function longDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function block(heading: string, lines: Array<string | null>, closing: string[] = []) {
  const present = lines.filter((line) => line !== null);

  return present.length === 0
    ? ''
    : [heading, ...present, ...closing].join('\n');
}

function termsBlock({ terms }: OutreachFacts) {
  return block('What we are looking for:', [
    terms.loanAmount === null ? null : `- Loan amount: ${dollars.format(terms.loanAmount)}`,
    terms.loanType === null ? null : `- Loan type: ${LOAN_TYPE_LABELS[terms.loanType]}`,
    terms.termYears === null
      ? null
      : `- Term: ${terms.termYears} ${terms.termYears === 1 ? 'year' : 'years'}`,
    terms.rateType === null ? null : `- Rate: ${RATE_LABELS[terms.rateType]}`,
    terms.sellerNoteAmount === null
      ? null
      : `- Seller note: ${dollars.format(terms.sellerNoteAmount)}`,
  ]);
}

function timelineBlock(facts: OutreachFacts) {
  const { targetCloseDate, mustCloseBy } = facts;

  return block(
    'Timeline:',
    [
      targetCloseDate === null ? null : `- Target close: ${longDate(targetCloseDate)}`,
      mustCloseBy === null
        ? null
        : `- Must close by: ${longDate(mustCloseBy)}`,
    ],
    mustCloseBy === null ? [] : [`Can you close by ${longDate(mustCloseBy)}?`],
  );
}

function fill(text: string, values: Record<string, string>) {
  return text
    .split('\n')
    .filter((line) =>
      [...line.matchAll(/\{\{(\w+)\}\}/g)].every(([, key]) => values[key!] !== ''),
    )
    .map((line) => line.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key]!))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const TEMPLATE_FIELDS = [
  'dealName',
  'contactName',
  'lenderName',
  'termsBlock',
  'timelineBlock',
  'roomLink',
  'ourName',
  'teamName',
];

export function draftEmail(template: OutreachTemplate, facts: OutreachFacts) {
  const values = {
    dealName: facts.dealName,
    contactName: facts.contactName,
    lenderName: facts.lenderName,
    roomLink: facts.roomLink,
    ourName: facts.ourName ?? '',
    teamName: facts.teamName,
    termsBlock: termsBlock(facts),
    timelineBlock: timelineBlock(facts),
  };

  return {
    subject: fill(template.subject, values),
    body: fill(template.body, values),
  };
}
