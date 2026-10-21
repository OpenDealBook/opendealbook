// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({ join: vi.fn() }));
const router = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('../_lib/join-team-action', () => ({ joinTeamAction: server.join }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

import { JoinTeam } from './join-team';

let container: HTMLDivElement;
let root: Root;

async function clickAccept() {
  await act(async () => {
    root.render(<JoinTeam token={'token-1'} />);
  });
  await act(async () => {
    container.querySelector('button')?.click();
  });
}

beforeEach(() => {
  server.join.mockReset();
  router.replace.mockReset();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('accepting a team invite', () => {
  it('moves into the team once the invite is accepted', async () => {
    server.join.mockResolvedValue({ redirectTo: '/home/acme' });

    await clickAccept();

    expect(router.replace).toHaveBeenCalledWith('/home/acme');
  });

  it('says the invite is spent instead of leaving a stuck button when it was used or expired since the page loaded', async () => {
    server.join.mockResolvedValue({ expired: true });

    await clickAccept();

    expect(container.textContent).toContain(
      'This invite has expired or was already used. Ask for a new one.',
    );
    expect(container.querySelector('button')).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
