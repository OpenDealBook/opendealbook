import { act } from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  button,
  clearScreen,
  show,
} from '@odb/lender-rooms/requests-ui/test-support/screen.ts';

import messages from '../../../../messages/en.json';
import TeamAccountLayout from './layout';

await vi.hoisted(async () => {
  const { builtinEnvironments } = await import('vitest/runtime');
  await builtinEnvironments.jsdom.setup(globalThis, {});
});

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) =>
    key
      .split('.')
      .reduce<unknown>(
        (node, part) => (node as Record<string, unknown>)[part],
        messages,
      ),
}));
vi.mock('@odb/auth', () => ({ useSignOut: () => async () => {} }));
vi.mock('@odb/lender-rooms/members/room-gate.ts', () => ({
  hasLenderRooms: async () => false,
}));
vi.mock('@odb/team-accounts/last-team', () => ({
  rememberLastTeam: async () => {},
}));
vi.mock('../_lib/trial', () => ({
  loadTrialState: async () => ({ isActive: true, endsAt: null }),
}));
vi.mock('../_components/trial-banner', () => ({ TrialBanner: () => null }));
vi.mock('../_components/billing-banner', () => ({ BillingBanner: () => null }));
vi.mock('~/config/paths.config', () => ({
  default: { auth: { signIn: '/auth/sign-in' } },
}));
vi.mock('~/config/team-account-navigation.config', () => ({
  teamNavigationFor: (slug: string) =>
    [
      ['work', 'common.home', ''],
      ['work', 'common.todos', '/todos'],
      ['work', 'common.deals', '/deals'],
      ['settings', 'account.dealBox', '/underwriting'],
      ['settings', 'account.members', '/members'],
      ['settings', 'account.teamSettings', '/settings'],
      ['settings', 'account.dealCalcDefaults', '/settings/deal-calc'],
      ['settings', 'common.compsImport', '/comps/import'],
    ].map(([group, label, path]) => ({
      group,
      label,
      path: `/home/${slug}${path}`,
    })),
}));
vi.mock('@odb/notifications/components', () => ({
  NotificationsPopover: ({ accountId }: { accountId: string }) => (
    <button data-notifications-for={accountId} />
  ),
}));

const teams = [
  { id: 'team-1', name: 'Acme', slug: 'acme' },
  { id: 'team-2', name: 'Beta Holdings', slug: 'beta-holdings' },
];

const query = {
  select: () => query,
  eq: () => query,
  in: async () => ({ data: teams }),
  then: (resolve: (value: { data: unknown[] }) => void) =>
    resolve({ data: [] }),
};

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: 'user-1', email: 'morgan@acme.test' } },
      }),
    },
    from: () => query,
    rpc: (name: string) => {
      const data =
        name === 'team_account_workspace'
          ? [
              {
                id: 'team-1',
                name: 'Acme',
                slug: 'acme',
                role: 'member',
                role_hierarchy_level: 2,
                permissions: [],
                primary_owner_user_id: 'user-2',
                subscription_status: null,
              },
            ]
          : 'good';
      return Object.assign(Promise.resolve({ data }), {
        throwOnError: async () => ({ data }),
      });
    },
  }),
}));

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

async function showLayout() {
  show(
    await TeamAccountLayout({
      children: null,
      params: Promise.resolve({ locale: 'en', account: 'acme' }),
    }),
  );
}

function text(element: Element) {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function groupLinks(scope: ParentNode, heading: string) {
  const group = [...scope.querySelectorAll('[role="group"]')].find(
    (each) =>
      text(document.getElementById(each.getAttribute('aria-labelledby')!)!) ===
      heading,
  )!;

  return [...group.querySelectorAll('a')].map((link) => [
    text(link),
    link.getAttribute('href'),
  ]);
}

function menuItem(name: string): HTMLElement {
  return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (item) => text(item) === name,
  )!;
}

async function openMenu(name: string) {
  await act(async () => {
    button(name).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
  });
}

afterEach(() => {
  clearScreen();
});

const workLinks = [
  ['Home', '/home/acme'],
  ['My Todos', '/home/acme/todos'],
  ['Deals', '/home/acme/deals'],
];

const settingsLinks = [
  ['Deal box', '/home/acme/underwriting'],
  ['Members', '/home/acme/members'],
  ['Team settings', '/home/acme/settings'],
  ['Deal calc defaults', '/home/acme/settings/deal-calc'],
  ['Comps import', '/home/acme/comps/import'],
];

describe('TeamAccountLayout', () => {
  it('shows the notification bell for the team being viewed', async () => {
    await showLayout();

    expect(
      document.querySelector('[data-notifications-for="team-1"]'),
    ).not.toBeNull();
  });

  it('splits the sidebar into Work and Settings groups with readable labels', async () => {
    await showLayout();
    const sidebar = document.querySelector('aside')!;

    expect(groupLinks(sidebar, 'Work')).toEqual(workLinks);
    expect(groupLinks(sidebar, 'Settings')).toEqual(settingsLinks);
  });

  it('lists the other teams and Create team inside the team switcher', async () => {
    await showLayout();

    expect(text(document.querySelector('aside')!)).not.toContain('Create team');

    await openMenu('Acme, switch team');

    expect(menuItem('Beta Holdings').getAttribute('href')).toBe(
      '/home/beta-holdings',
    );
    expect(menuItem('Create team').getAttribute('href')).toBe(
      '/home/create-team',
    );
  });

  it('offers Account settings and Sign out from the account menu', async () => {
    await showLayout();

    await openMenu('Account menu for morgan@acme.test');

    expect(menuItem('Account settings').getAttribute('href')).toBe(
      '/home/settings',
    );
    expect(menuItem('Sign out')).toBeDefined();
  });

  it('lands the skip link on the page content, past the header controls', async () => {
    show(
      await TeamAccountLayout({
        children: <h1>Deals</h1>,
        params: Promise.resolve({ locale: 'en', account: 'acme' }),
      }),
    );
    const skip = [...document.querySelectorAll('a')].find(
      (link) => text(link) === 'Skip to content',
    )!;
    const target = document.getElementById(
      skip.getAttribute('href')!.slice(1),
    )!;

    target.focus();

    expect(document.activeElement).toBe(target);
    expect(text(target)).toBe('Deals');
  });

  it('opens the same navigation in a slide-out sheet from the menu button and closes it on navigation', async () => {
    await showLayout();

    await act(async () => {
      button('Menu').click();
    });
    const sheet = document.querySelector('[role="dialog"]')!;

    expect(groupLinks(sheet, 'Work')).toEqual(workLinks);
    expect(groupLinks(sheet, 'Settings')).toEqual(settingsLinks);

    await act(async () => {
      sheet
        .querySelector<HTMLAnchorElement>('a[href="/home/acme/deals"]')!
        .click();
    });

    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
