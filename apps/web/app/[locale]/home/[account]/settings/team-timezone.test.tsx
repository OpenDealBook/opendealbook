// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SCHEDULES_STUCK = "Saved, but schedules couldn't be updated; try again";

const server = vi.hoisted(() => ({
  save: vi.fn(),
  retry: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('./team-timezone-actions', () => ({
  updateTeamTimezoneAction: server.save,
  retryTeamScheduleSyncAction: server.retry,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
}));

import { TeamTimezoneSetting } from './team-timezone';

let container: HTMLDivElement;
let root: Root;

function zoneSelect() {
  return container.querySelector('select')!;
}

function alertText() {
  return container.querySelector('[role=alert]')?.textContent;
}

function tryAgainButton() {
  return [...container.querySelectorAll('button')].find(
    (button) => button.textContent === 'Try again',
  );
}

async function render(canManage: boolean) {
  await act(async () => {
    root.render(
      <TeamTimezoneSetting
        accountId={'team-1'}
        current={'Europe/Lisbon'}
        zones={['UTC', 'Asia/Tokyo', 'Europe/Lisbon']}
        canManage={canManage}
      />,
    );
  });
}

async function pick(zone: string) {
  await act(async () => {
    zoneSelect().value = zone;
    zoneSelect().dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  server.save
    .mockReset()
    .mockResolvedValue({ ok: true, value: { schedulesError: null } });
  server.retry
    .mockReset()
    .mockResolvedValue({ ok: true, value: { schedulesError: null } });
  server.refresh.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('the team time zone setting', () => {
  it('explains what the zone is used for and offers exactly the zones it is given', async () => {
    await render(true);

    expect(container.textContent).toContain(
      'Used for workflow schedules, waits and to-do due dates.',
    );
    expect([...zoneSelect().options].map((option) => option.value)).toEqual([
      'UTC',
      'Asia/Tokyo',
      'Europe/Lisbon',
    ]);
    expect(zoneSelect().value).toBe('Europe/Lisbon');
  });

  it('saves the zone a settings manager picks for the team', async () => {
    await render(true);

    await pick('Asia/Tokyo');

    expect(server.save).toHaveBeenCalledWith({
      accountId: 'team-1',
      timezone: 'Asia/Tokyo',
    });
    expect(server.refresh).toHaveBeenCalled();
    expect(alertText()).toBeUndefined();
    expect(tryAgainButton()).toBeUndefined();
  });

  it('shows why a save was refused', async () => {
    server.save.mockResolvedValue({
      ok: false,
      refusal: 'Changing the time zone needs settings.manage',
    });
    await render(true);

    await pick('Asia/Tokyo');

    expect(alertText()).toBe('Changing the time zone needs settings.manage');
    expect(tryAgainButton()).toBeUndefined();
  });

  it('offers to retry moving schedules after a save whose schedules did not move', async () => {
    server.save.mockResolvedValue({
      ok: true,
      value: { schedulesError: SCHEDULES_STUCK },
    });
    await render(true);

    await pick('Asia/Tokyo');

    expect(alertText()).toBe(SCHEDULES_STUCK);

    await act(async () => tryAgainButton()!.click());

    expect(server.retry).toHaveBeenCalledWith({ accountId: 'team-1' });
    expect(alertText()).toBeUndefined();
    expect(tryAgainButton()).toBeUndefined();
  });

  it('keeps offering a retry while schedules still do not move', async () => {
    server.save.mockResolvedValue({
      ok: true,
      value: { schedulesError: SCHEDULES_STUCK },
    });
    server.retry.mockResolvedValue({
      ok: true,
      value: { schedulesError: SCHEDULES_STUCK },
    });
    await render(true);
    await pick('Asia/Tokyo');

    await act(async () => tryAgainButton()!.click());

    expect(alertText()).toBe(SCHEDULES_STUCK);
    expect(tryAgainButton()).toBeDefined();
  });

  it('is read-only for members who cannot manage settings', async () => {
    await render(false);

    expect(zoneSelect().disabled).toBe(true);
    expect(zoneSelect().value).toBe('Europe/Lisbon');
  });
});
