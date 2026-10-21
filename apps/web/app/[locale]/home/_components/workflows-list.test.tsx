// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../[account]/workflows/actions', () => ({
  setWorkflowEnabled: vi.fn(),
  setWorkflowArchived: vi.fn(),
  runWorkflowNow: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { WorkflowsList, type WorkflowListRow } from './workflows-list';

const published: WorkflowListRow = {
  id: 'wf-1',
  name: 'Overdue milestone notices',
  enabled: true,
  archived: false,
  publishedAt: '2026-10-01T15:00:00Z',
  lastRun: { status: 'paused_locked', startedAt: '2026-10-02T15:00:00Z' },
};

const draft: WorkflowListRow = {
  id: 'wf-2',
  name: 'Lender reply sync',
  enabled: false,
  archived: false,
  publishedAt: null,
  lastRun: null,
};

let container: HTMLDivElement;
let root: Root;

function render(
  props: Partial<Parameters<typeof WorkflowsList>[0]> = {},
): HTMLDivElement {
  act(() =>
    root.render(
      <WorkflowsList
        workflows={[published, draft]}
        view={'active'}
        canManage={true}
        basePath={'/home/team-one/workflows'}
        {...props}
      />,
    ),
  );

  return container;
}

function rowFor(name: string) {
  return [...container.querySelectorAll('tbody tr')].find((row) =>
    row.textContent?.includes(name),
  )!;
}

function buttonsIn(element: Element) {
  return [...element.querySelectorAll('button')].map((b) => b.textContent);
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('WorkflowsList', () => {
  it('links each workflow to its own page', () => {
    render();

    expect(
      rowFor('Overdue milestone notices')
        .querySelector('a')
        ?.getAttribute('href'),
    ).toBe('/home/team-one/workflows/wf-1');
  });

  it('shows whether each workflow is enabled, its published version and its last run', () => {
    render();

    const live = rowFor('Overdue milestone notices').textContent;
    const unpublished = rowFor('Lender reply sync').textContent;

    expect(live).toContain('Enabled');
    expect(live).toContain('Published Oct 1');
    expect(live).toContain('Paused, team locked');
    expect(live).toContain('Oct 2');
    expect(unpublished).toContain('Disabled');
    expect(unpublished).toContain('Not published');
    expect(unpublished).toContain('Never run');
  });

  it('offers Active and Archived filters with the current one marked', () => {
    render({ view: 'archived', workflows: [] });

    const filters = [...container.querySelectorAll('nav a')];

    expect(
      filters.map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Active', '/home/team-one/workflows'],
      ['Archived', '/home/team-one/workflows?view=archived'],
    ]);
    expect(
      container.querySelector('nav a[aria-current="page"]')?.textContent,
    ).toBe('Archived');
  });

  it('gives a manager enable, disable, archive and Run now on active workflows', () => {
    render();

    expect(buttonsIn(rowFor('Overdue milestone notices'))).toEqual([
      'Disable',
      'Run now',
      'Archive',
    ]);
    expect(buttonsIn(rowFor('Lender reply sync'))).toEqual([
      'Enable',
      'Run now',
      'Archive',
    ]);
  });

  it('gives a manager only Unarchive on archived workflows', () => {
    render({
      view: 'archived',
      workflows: [{ ...draft, archived: true }],
    });

    expect(buttonsIn(rowFor('Lender reply sync'))).toEqual(['Unarchive']);
  });

  it('shows the list read-only to a member without workflows.manage', () => {
    render({ canManage: false });

    expect(container.textContent).toContain('Overdue milestone notices');
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('says plainly that workflows cannot be created yet when the team has none', () => {
    render({ workflows: [] });

    expect(container.querySelector('table')).toBeNull();
    expect(container.textContent).toContain(
      'No workflows yet. Creating workflows arrives with the workflow editor.',
    );
    expect(container.textContent).not.toContain('New workflow');
  });

  it('says when nothing is archived', () => {
    render({ view: 'archived', workflows: [] });

    expect(container.textContent).toContain('No archived workflows.');
  });
});
