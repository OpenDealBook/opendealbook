import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => ({
  notice: null as string | null,
  scheduled: [] as Array<() => unknown>,
  resumed: [] as string[],
  permissions: ['deals.manage'] as string[],
  agendaCalls: [] as Array<{ accountId: string; wholeTeam: boolean }>,
  visits: [] as string[],
}));

vi.mock('next/server', () => ({
  after: (task: () => unknown) => world.scheduled.push(task),
}));
vi.mock('./layout', () => ({
  loadTeamWorkspace: async () => ({
    team: { id: 'team-1', name: 'Acme', slug: 'acme' },
    user: { id: 'user-1' },
    permissions: world.permissions,
  }),
}));
vi.mock('../_lib/team-agenda', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadTeamAgenda: async (accountId: string, wholeTeam: boolean) => {
    world.agendaCalls.push({ accountId, wholeTeam });
    return [
      {
        section: 'overdue',
        kind: 'todo',
        item_id: 'todo-1',
        deal_id: 'deal-1',
        deal_name: 'Brennan Climate',
        room_id: null,
        title: 'Call the broker',
        detail: null,
        at: '2026-10-17T00:00:00+00:00',
      },
    ];
  },
  markTeamHomeVisited: async (accountId: string) => {
    world.visits.push(accountId);
  },
}));
vi.mock('../_lib/ensure-trial-sample-data', () => ({
  ensureSampleDeals: async () => world.notice,
}));
vi.mock('../_lib/trial-drip', () => ({
  resumeTrialDrip: async (teamId: string) => {
    world.resumed.push(teamId);
  },
}));

import TeamHomePage from './page';

async function visit(scope?: string): Promise<string> {
  return renderToStaticMarkup(
    await TeamHomePage({
      params: Promise.resolve({ locale: 'en', account: 'acme' }),
      searchParams: Promise.resolve({ scope }),
    }),
  );
}

beforeEach(() => {
  world.notice = null;
  world.scheduled.length = 0;
  world.resumed.length = 0;
  world.permissions = ['deals.manage'];
  world.agendaCalls.length = 0;
  world.visits.length = 0;
});

it('shows the team home with no notice when the examples are in place', async () => {
  const html = await visit();

  expect(html).toContain('Today');
  expect(html).not.toContain('role="alert"');
});

it("opens on the person's own agenda, each row linking to its item", async () => {
  const html = await visit();

  expect(world.agendaCalls).toEqual([
    { accountId: 'team-1', wholeTeam: false },
  ]);
  expect(html).toContain('href="/home/acme/deals/deal-1/todos#todo-todo-1"');
});

it('shows a manager the whole team when they ask for it', async () => {
  const html = await visit('team');

  expect(world.agendaCalls).toEqual([{ accountId: 'team-1', wholeTeam: true }]);
  expect(html).toContain('Whole team');
});

it('keeps someone who is not a manager on their own agenda', async () => {
  world.permissions = ['deals.work'];

  const html = await visit('team');

  expect(world.agendaCalls).toEqual([
    { accountId: 'team-1', wholeTeam: false },
  ]);
  expect(html).not.toContain('Whole team');
});

it('records the visit only after the page is sent', async () => {
  await visit();

  expect(world.visits).toEqual([]);
  await Promise.all(world.scheduled.map((task) => task()));
  expect(world.visits).toEqual(['team-1']);
});

it('tells the team when the examples could not be loaded', async () => {
  world.notice = "Example deals couldn't be loaded. Reload them from Settings.";

  expect(await visit()).toContain(
    'Example deals couldn&#x27;t be loaded. Reload them from Settings.',
  );
});

it("resumes the team's trial emails after the page is sent", async () => {
  await visit();

  expect(world.resumed).toEqual([]);
  await Promise.all(world.scheduled.map((task) => task()));
  expect(world.resumed).toEqual(['team-1']);
});
