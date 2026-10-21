// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('@odb/seller-rooms/rooms/request-access.ts', () => ({
  requestSellerRoomAccess: server.request,
}));

import { ClosedRoom } from './closed-room';

let container: HTMLDivElement;
let root: Root;

function askButton() {
  return [...container.querySelectorAll('button')].find(
    (button) => button.textContent === 'Ask to reopen',
  );
}

const ROOM_CLOSED = 'The seller room is closed, so this is read-only.';
const DEAL_CLOSED = 'This deal has closed, so everything here is read-only.';

async function render(canAskToReopen: boolean, readOnlyReason = ROOM_CLOSED) {
  await act(async () => {
    root.render(
      <ClosedRoom
        roomId={'room-1'}
        teamName={'Acme Partners'}
        contactEmail={'deals@acme.test'}
        canAskToReopen={canAskToReopen}
        readOnlyReason={readOnlyReason}
      />,
    );
  });
}

beforeEach(() => {
  server.request.mockReset().mockResolvedValue({ ok: true, value: undefined });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('the closed seller room', () => {
  it('says why the room is read-only and how to reach the team', async () => {
    await render(true);

    expect(container.textContent).toContain(
      `${ROOM_CLOSED}To ask Acme Partners to reopen it, use the button below or write to deals@acme.test.`,
    );
    expect(container.textContent).not.toContain('This room is closed.');
    expect(
      container.querySelector('a[href="mailto:deals@acme.test"]'),
    ).not.toBeNull();
  });

  it('asks the team to reopen and confirms', async () => {
    await render(true);

    await act(async () => askButton()!.click());

    expect(server.request).toHaveBeenCalledWith({ roomId: 'room-1' });
    expect(container.textContent).toContain('Your request has been sent.');
  });

  it('shows why a request was refused', async () => {
    server.request.mockResolvedValue({
      ok: false,
      refusal: 'This room is open',
    });
    await render(true);

    await act(async () => askButton()!.click());

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'This room is open',
    );
  });

  it('gives the deal reason and offers no request once the deal has closed', async () => {
    await render(false, DEAL_CLOSED);

    expect(askButton()).toBeUndefined();
    expect(container.textContent).toContain(DEAL_CLOSED);
    expect(container.textContent).not.toContain('This room is closed.');
    expect(container.textContent).toContain('deals@acme.test');
  });
});
