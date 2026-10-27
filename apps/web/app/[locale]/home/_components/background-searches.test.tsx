// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';

import {
  type BackgroundFinding,
  type BackgroundSearch,
  BackgroundSearches,
} from './background-searches';
import { clearScreen, links, pageText, show } from './lender-test-kit';
import { workflowTime } from './workflow-run-status';

const BASE = '/home/team-one/deals/deal-1/background';

function finding(overrides: Partial<BackgroundFinding>): BackgroundFinding {
  return {
    id: 'finding-1',
    subject_kind: 'business',
    subject_name: 'Rowan Fixture Plumbing',
    source: 'courts',
    severity: 'red',
    severity_reason: 'Open civil suit against the business',
    title: 'Harbour Supply v. Rowan Fixture Plumbing',
    source_url: 'https://www.courtlistener.com/docket/1/',
    occurred_on: '2021-03-04',
    ...overrides,
  };
}

function search(overrides: Partial<BackgroundSearch>): BackgroundSearch {
  return {
    id: 'search-1',
    status: 'succeeded',
    error: null,
    started_at: '2026-10-20T15:00:00Z',
    skipped: [],
    report: {
      summary: 'One open lawsuit needs review.',
      created_at: '2026-10-20T15:05:00Z',
    },
    findings: [],
    ...overrides,
  };
}

function render(searches: BackgroundSearch[], selected?: string) {
  show(
    <BackgroundSearches
      searches={searches}
      selected={selected}
      basePath={BASE}
      runAgain={<button type={'button'}>Run again</button>}
    />,
  );
}

function at(timestamp: string): string {
  return workflowTime.format(new Date(timestamp));
}

function headings(): string[] {
  return [...document.querySelectorAll('h3')].map(
    (heading) => heading.textContent ?? '',
  );
}

afterEach(clearScreen);

it('explains when the search runs before there has been one', () => {
  render([]);

  expect(pageText()).toContain('No background search yet');
  expect(pageText()).toContain(
    'The search runs when the LOI is signed, or when a deal manager selects Run again.',
  );
});

it('shows the latest report with its status, summary and findings grouped red, amber, green', () => {
  render([
    search({
      findings: [
        finding({
          id: 'g',
          severity: 'green',
          title: 'Five-star review',
          source: 'reviews',
        }),
        finding({ id: 'r', severity: 'red' }),
        finding({
          id: 'a',
          severity: 'amber',
          subject_kind: 'person',
          subject_name: 'Dana Rowan',
          source: 'sanctions',
          title: 'Dana Rowen on SDN list',
          severity_reason: 'Possible match, review.',
          occurred_on: null,
        }),
      ],
    }),
  ]);

  expect(pageText()).toContain('Succeeded');
  expect(pageText()).toContain('One open lawsuit needs review.');
  expect(headings()).toEqual(['Red (1)', 'Amber (1)', 'Green (1)']);

  const red = document.querySelector('[data-severity="red"]')!.textContent;
  expect(red).toContain('Red');
  expect(red).toContain('Rowan Fixture Plumbing, business');
  expect(red).toContain('Courts');
  expect(red).toContain('Harbour Supply v. Rowan Fixture Plumbing');
  expect(red).toContain('Mar 4, 2021');
  expect(red).toContain('Open civil suit against the business');

  const amber = document.querySelector('[data-severity="amber"]')!.textContent;
  expect(amber).toContain('Dana Rowan, person');
  expect(amber).toContain('Sanctions');

  const source = document.querySelector(
    'a[href="https://www.courtlistener.com/docket/1/"]',
  )!;
  expect(source.getAttribute('target')).toBe('_blank');
  expect(source.getAttribute('rel')).toBe('noopener noreferrer');
});

it('lists earlier reports by date, newest first, and shows the one selected', () => {
  const latest = search({ id: 'search-3', started_at: '2026-10-25T09:00:00Z' });
  const middle = search({
    id: 'search-2',
    started_at: '2026-10-22T09:00:00Z',
    report: { summary: 'Middle report', created_at: '2026-10-22T09:05:00Z' },
  });
  const oldest = search({
    id: 'search-1',
    started_at: '2026-10-01T09:00:00Z',
    report: { summary: 'Oldest report', created_at: '2026-10-01T09:05:00Z' },
  });

  render([latest, middle, oldest], 'search-2');

  expect(pageText()).toContain('Middle report');
  expect(pageText()).not.toContain('One open lawsuit needs review.');
  expect(links().filter((link) => link.href?.startsWith(`${BASE}?`))).toEqual([
    {
      text: `${at('2026-10-25T09:00:00Z')}Succeeded`,
      href: `${BASE}?search=search-3`,
    },
    {
      text: `${at('2026-10-22T09:00:00Z')}Succeeded`,
      href: `${BASE}?search=search-2`,
    },
    {
      text: `${at('2026-10-01T09:00:00Z')}Succeeded`,
      href: `${BASE}?search=search-1`,
    },
  ]);
  expect(
    document.querySelector('[aria-current="page"]')?.getAttribute('href'),
  ).toBe(`${BASE}?search=search-2`);
});

it('shows the progress of a search that has no report yet', () => {
  render([search({ status: 'paused_cap', report: null })]);

  expect(pageText()).toContain('Paused, cap reached');
  expect(pageText()).toContain(
    'The search is still in progress. Reload the page to see the report once it is written.',
  );
});

it('shows saved findings unrated with the reason the report was not written', () => {
  render([
    search({
      status: 'failed',
      error: 'Connect an AI provider to write the report',
      report: null,
      findings: [finding({ severity: null, severity_reason: null })],
    }),
  ]);

  expect(pageText()).toContain('Failed');
  expect(pageText()).toContain(
    'The report was not written. Connect an AI provider to write the report',
  );
  expect(headings()).toEqual(['Not rated (1)']);
  expect(
    document.querySelector('[data-severity="unrated"]')!.textContent,
  ).toContain('Harbour Supply v. Rowan Fixture Plumbing');
});

it('names the sources the search skipped', () => {
  render([
    search({
      skipped: [
        'Connect a CourtListener token to search federal courts',
        'Connect an email lookup provider to search news',
      ],
    }),
  ]);

  expect(pageText()).toContain('Not searched');
  expect(
    [...document.querySelectorAll('li')].map((item) => item.textContent),
  ).toEqual([
    'Connect a CourtListener token to search federal courts',
    'Connect an email lookup provider to search news',
  ]);
});
