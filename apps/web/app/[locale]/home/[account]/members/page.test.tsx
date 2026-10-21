// @vitest-environment jsdom
import { act } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MEMBER_ID = '6f1c2b7e-0a4d-4c55-9a43-2f5e8d1b9c10';
const ANALYST_ID = '0b3e7a52-1c9d-4f2e-8a61-5d4c3b2a1f00';

const store = vi.hoisted(() => ({
  invitations: [] as {
    id: number;
    email: string;
    role: string;
    expires_at: string;
    created_at: string;
  }[],
}));

function rows(data: unknown) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    order: () => builder,
    throwOnError: () => builder,
    then: (resolve: (value: unknown) => unknown) =>
      resolve({ data, error: null }),
  };
  return builder;
}

vi.mock('../layout', () => ({
  loadTeamWorkspace: async () => ({
    team: { id: 'team-1', name: 'Crew', slug: 'crew' },
    actorRole: { name: 'owner', hierarchyLevel: 1 },
    permissions: ['members.manage', 'invites.manage'],
    isOwner: true,
  }),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) =>
      table === 'roles'
        ? rows([
            { name: 'owner', hierarchy_level: 1 },
            { name: 'admin', hierarchy_level: 2 },
            { name: 'member', hierarchy_level: 3 },
            { name: 'analyst', hierarchy_level: 5 },
          ])
        : rows([
            {
              user_id: MEMBER_ID,
              account_role: 'member',
              created_at: '2026-10-01T00:00:00.000Z',
            },
            {
              user_id: ANALYST_ID,
              account_role: 'analyst',
              created_at: '2026-10-02T00:00:00.000Z',
            },
          ]),
  }),
  getSupabaseServerAdminClient: () => ({
    from: () =>
      rows([
        {
          primary_owner_user_id: MEMBER_ID,
          name: 'Dana Reyes',
          email: 'dana@crew.test',
        },
        {
          primary_owner_user_id: ANALYST_ID,
          name: 'Ari Patel',
          email: 'ari@crew.test',
        },
      ]),
  }),
}));

vi.mock('@odb/supabase/hooks', () => ({
  useSupabase: () => ({ from: () => rows(store.invitations) }),
}));

vi.mock(
  '../../../../../../../packages/features/team-accounts/src/server/invitations-actions',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    inviteMembersAction: async (values: {
      invitations: { email: string; role: string }[];
    }) => {
      store.invitations.push(
        ...values.invitations.map((invitation, index) => ({
          id: index + 1,
          email: invitation.email,
          role: invitation.role,
          expires_at: '2026-11-01T00:00:00.000Z',
          created_at: '2026-10-19T00:00:00.000Z',
        })),
      );
    },
  }),
);

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (action: unknown) => action,
}));

import TeamMembersPage from './page';

let container: HTMLDivElement;
let root: Root;

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function press(element: Element, key: string) {
  await act(async () => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

function text() {
  return container.textContent ?? '';
}

function roleTrigger() {
  return container.querySelector<HTMLButtonElement>('form [role=combobox]')!;
}

function optionLabels() {
  return [...document.querySelectorAll('[role=option]')].map(
    (option) => option.textContent,
  );
}

beforeEach(async () => {
  store.invitations = [];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const page = await TeamMembersPage({
    params: Promise.resolve({ locale: 'en', account: 'crew' }),
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        {page}
      </QueryClientProvider>,
    );
  });
  await settle();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('TeamMembersPage', () => {
  it('is titled Members and heads the invitations table', () => {
    expect(container.querySelector('h1')!.textContent).toBe('Members');
    expect(
      [...container.querySelectorAll('h2')].map(
        (heading) => heading.textContent,
      ),
    ).toContain('Invitations');
  });

  it('lists a member by full name with their email and role label, never their id', () => {
    expect(text()).toContain('Dana Reyes');
    expect(text()).toContain('dana@crew.test');
    expect(text()).toContain('Team member');
    expect(text()).not.toContain(MEMBER_ID);
  });

  it('shows an existing analyst as a team member, in the badge and the role dialog', async () => {
    const analystRow = [...container.querySelectorAll('tr')].find((row) =>
      row.textContent!.includes('Ari Patel'),
    )!;
    expect(analystRow.textContent).toContain('Team member');
    expect(analystRow.textContent).not.toContain('analyst');

    const update = [...analystRow.querySelectorAll('button')].find(
      (button) => button.textContent === 'Update role',
    )!;
    await act(async () => {
      update.click();
    });

    expect(
      document.querySelector('[role=dialog] [role=combobox]')!.textContent,
    ).toBe('Team member');
  });

  it('defaults the invite role to Team member and offers only the five tenant roles', async () => {
    expect(roleTrigger().textContent).toBe('Team member');

    roleTrigger().focus();
    await press(roleTrigger(), 'Enter');

    expect(optionLabels()).toEqual([
      'Admin',
      'Deal lead',
      'Team member',
      'In-house counsel',
      'Read only',
    ]);
  });

  it('shows a newly sent invitation without a reload', async () => {
    const email = container.querySelector<HTMLInputElement>(
      'input[placeholder="Email"]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(email, 'sam@crew.test');
      email.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const send = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Send invitations',
    )!;
    await act(async () => {
      send.click();
    });
    await settle();

    expect(text()).toContain('sam@crew.test');
  });
});
