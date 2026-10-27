// @vitest-environment jsdom
import type { ComponentProps } from 'react';

import { afterEach, expect, it } from 'vitest';

import { LeadsPipeline, type LeadRow } from './leads-pipeline';
import { clearScreen, linkTo, pageText, show } from './lender-test-kit';

type Props = ComponentProps<typeof LeadsPipeline>;

const acme: LeadRow = {
  firmId: 'f1',
  name: 'Acme Plumbing',
  city: 'Austin',
  state: 'TX',
  jobs: 18,
  pppLoanAmount: 150000,
  headcount: 25,
  businessAgeYears: 25,
  sources: ['ppp', 'sba_7a', 'form_5500', 'state_registry'],
  needsReview: false,
  verdict: 'fit',
  approval: 'approved',
  emailCount: 2,
  outreach: 'sending',
};

const bolt: LeadRow = {
  firmId: 'f2',
  name: 'Bolt Roofing',
  city: null,
  state: null,
  jobs: null,
  pppLoanAmount: null,
  headcount: null,
  businessAgeYears: null,
  sources: [],
  needsReview: true,
  verdict: null,
  approval: null,
  emailCount: 0,
  outreach: 'not_started',
};

const noFilters = { verdict: '', source: '', state: '', q: '' };

function showPipeline(overrides: Partial<Props> = {}) {
  show(
    <LeadsPipeline
      rows={[acme, bolt]}
      total={2}
      page={1}
      pageSize={50}
      filters={noFilters}
      stateOptions={['OK', 'TX']}
      basePath={'/home/team-one/leads'}
      workflowsHref={'/home/team-one/workflows'}
      approvalsHref={'/home/team-one/approvals'}
      {...overrides}
    />,
  );
}

function cellsOf(firmName: string): string[] {
  const row = [...document.querySelectorAll('tbody tr')].find((each) =>
    each.textContent?.includes(firmName),
  )!;

  return [...row.querySelectorAll('td')].map(wordsIn);
}

function wordsIn(cell: Element): string {
  const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
  const words: string[] = [];

  while (walker.nextNode()) {
    words.push(walker.currentNode.textContent ?? '');
  }

  return words.join(' ').replace(/\s+/g, ' ').trim();
}

function headers(): string[] {
  return [...document.querySelectorAll('th')].map((cell) =>
    (cell.textContent ?? '').trim(),
  );
}

function selectNamed(name: string): HTMLSelectElement {
  return document.querySelector(`select[name="${name}"]`)!;
}

afterEach(clearScreen);

it('lists each pulled firm with location, size signals, sources, match, verdict, emails and outreach', () => {
  showPipeline();

  expect(headers()).toEqual([
    'Firm',
    'Location',
    'Size signals',
    'Sources',
    'Match',
    'Verdict',
    'Emails found',
    'Outreach',
  ]);
  expect(cellsOf('Acme Plumbing')).toEqual([
    'Acme Plumbing',
    'Austin, TX',
    '18 jobs $150,000 PPP loan 25 on Form 5500 25 years old',
    'PPP SBA 7(a) Form 5500 State registry',
    'Matched',
    'Fit Approved',
    '2',
    'Sending',
  ]);
  expect(cellsOf('Bolt Roofing')).toEqual([
    'Bolt Roofing',
    'Unknown',
    'None yet',
    'None yet',
    'Needs review',
    'No verdict',
    '0',
    'Not started',
  ]);
});

it.each([
  ['not_fit', 'overridden', 'Not a fit Overridden'],
  ['fit', 'revoked', 'Fit Revoked'],
] as const)('shows a %s verdict that is %s', (verdict, approval, shown) => {
  showPipeline({ rows: [{ ...acme, verdict, approval }] });

  expect(cellsOf('Acme Plumbing')[5]).toBe(shown);
});

it('links a verdict awaiting approval to the Approvals inbox', () => {
  showPipeline({
    rows: [
      { ...acme, approval: 'awaiting_approval', outreach: 'awaiting_approval' },
    ],
  });

  expect(cellsOf('Acme Plumbing')[5]).toBe('Fit Awaiting approval');
  expect(cellsOf('Acme Plumbing')[7]).toBe('Awaiting approval');
  expect(linkTo('Awaiting approval')).toBe('/home/team-one/approvals');
});

it('shows a verdict awaiting approval without a link for people who cannot open Approvals', () => {
  showPipeline({
    rows: [{ ...acme, approval: 'awaiting_approval' }],
    approvalsHref: null,
  });

  expect(cellsOf('Acme Plumbing')[5]).toBe('Fit Awaiting approval');
  expect(linkTo('Awaiting approval')).toBeUndefined();
});

it('shows a rejected verdict without a link to Approvals', () => {
  showPipeline({
    rows: [{ ...acme, verdict: 'not_fit', approval: 'rejected' }],
  });

  expect(cellsOf('Acme Plumbing')[5]).toBe('Not a fit Rejected');
  expect(linkTo('Rejected')).toBeUndefined();
});

it.each([
  ['sending', 'Sending'],
  ['done', 'Done'],
  ['bounced', 'Bounced'],
  ['replied', 'Replied'],
  ['stopped', 'Stopped'],
] as const)('shows %s outreach', (outreach, shown) => {
  showPipeline({ rows: [{ ...acme, outreach }] });

  expect(cellsOf('Acme Plumbing')[7]).toBe(shown);
});

it('filters by verdict, source and state and searches by name, keeping the current choices', () => {
  showPipeline({
    filters: { verdict: 'not_fit', source: 'sba_504', state: 'TX', q: 'acme' },
  });

  const form = document.querySelector('form')!;

  expect(form.getAttribute('method')).toBe('get');
  expect(form.getAttribute('action')).toBe('/home/team-one/leads');
  expect([...selectNamed('verdict').options].map((each) => each.text)).toEqual([
    'Any verdict',
    'Fit',
    'Not a fit',
    'No verdict',
  ]);
  expect([...selectNamed('source').options].map((each) => each.text)).toEqual([
    'Any source',
    'PPP',
    'SBA 7(a)',
    'SBA 504',
    'Form 5500',
    'State registry',
  ]);
  expect([...selectNamed('state').options].map((each) => each.text)).toEqual([
    'Any state',
    'OK',
    'TX',
  ]);
  expect(selectNamed('verdict').value).toBe('not_fit');
  expect(selectNamed('source').value).toBe('sba_504');
  expect(selectNamed('state').value).toBe('TX');
  expect(
    document.querySelector<HTMLInputElement>('input[name="q"]')!.value,
  ).toBe('acme');
});

it('pages through results on the server, keeping the filters', () => {
  showPipeline({
    total: 120,
    page: 2,
    filters: { ...noFilters, state: 'TX' },
  });

  expect(pageText()).toContain('Showing 51 to 100 of 120 firms');
  expect(linkTo('Previous page')).toBe('/home/team-one/leads?state=TX');
  expect(linkTo('Next page')).toBe('/home/team-one/leads?state=TX&page=3');
});

it('offers no next page on the last page', () => {
  showPipeline({ total: 2 });

  expect(linkTo('Next page')).toBeUndefined();
  expect(linkTo('Previous page')).toBeUndefined();
});

it('explains that leads come from workflow pulls when the team has none', () => {
  showPipeline({ rows: [], total: 0 });

  expect(pageText()).toContain(
    'No leads yet. Firms land here when a workflow pulls them from public records such as PPP and SBA loans, Form 5500 filings and state registries.',
  );
  expect(linkTo('Open Workflows')).toBe('/home/team-one/workflows');
  expect(document.querySelector('table')).toBeNull();
});

it('says when no firm matches the filters and offers to clear them', () => {
  showPipeline({ rows: [], total: 0, filters: { ...noFilters, q: 'zzz' } });

  expect(pageText()).toContain('No firms match these filters.');
  expect(linkTo('Clear filters')).toBe('/home/team-one/leads');
});
