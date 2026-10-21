// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({
  close: vi.fn(),
  prepare: vi.fn(),
  reopen: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@odb/seller-rooms/rooms/actions.ts', () => ({
  closeSellerRoom: server.close,
  prepareSellerRoomClose: server.prepare,
  reopenSellerRoom: server.reopen,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
}));

import { SellerRoomLifecycle } from './seller-room-lifecycle';

let container: HTMLDivElement;
let root: Root;

function button(label: string) {
  return [...document.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === label,
  );
}

async function render(
  isClosed: boolean,
  isDealArchived = false,
  closing = { ready: true, hasOwnTodo: true },
) {
  await act(async () => {
    root.render(
      <SellerRoomLifecycle
        dealId={'deal-1'}
        isClosed={isClosed}
        isDealArchived={isDealArchived}
        closing={closing}
      />,
    );
  });
}

async function click(label: string) {
  await act(async () => button(label)!.click());
}

beforeEach(() => {
  server.close.mockReset().mockResolvedValue({ ok: true, value: undefined });
  server.reopen.mockReset().mockResolvedValue({ ok: true, value: undefined });
  server.prepare.mockReset().mockResolvedValue({ ok: true, value: undefined });
  server.refresh.mockReset();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('closing and reopening the seller room', () => {
  it('closes an open room only after the team confirms', async () => {
    await render(false);

    expect(button('Reopen room')).toBeUndefined();

    await click('Close room');
    expect(document.body.textContent).toContain(
      'Every seller will lose access immediately',
    );
    expect(server.close).not.toHaveBeenCalled();

    await click('Close this room');
    expect(server.close).toHaveBeenCalledWith({ dealId: 'deal-1' });
    expect(server.refresh).toHaveBeenCalled();
  });

  it('starts a close with a to-do for the person when nobody has told the sellers yet', async () => {
    await render(false, false, { ready: false, hasOwnTodo: false });

    await click('Close room');

    expect(server.prepare).toHaveBeenCalledWith({ dealId: 'deal-1' });
    expect(server.close).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(
      'Every seller will lose access immediately',
    );
    expect(server.refresh).toHaveBeenCalled();
  });

  it('keeps Close disabled until the sellers or brokers have been told', async () => {
    await render(false, false, { ready: false, hasOwnTodo: true });

    expect(button('Close room')!.disabled).toBe(true);
    expect(container.textContent).toContain(
      'Tick "Tell the seller/broker the room is closing" in this deal\'s to-dos, or send an update to Sellers or Brokers, to close the room.',
    );
  });

  it('keeps the room open when the team backs out', async () => {
    await render(false);

    await click('Close room');
    await click('Keep open');

    expect(server.close).not.toHaveBeenCalled();
  });

  it('reopens a closed room', async () => {
    await render(true);

    expect(button('Close room')).toBeUndefined();

    await click('Reopen room');
    expect(server.reopen).toHaveBeenCalledWith({ dealId: 'deal-1' });
    expect(server.refresh).toHaveBeenCalled();
  });

  it('tells the team to unarchive the deal instead of offering to reopen', async () => {
    await render(true, true);

    expect(container.textContent).toContain(
      'Unarchive the deal to reopen this room',
    );
    expect(button('Reopen room')).toBeUndefined();
    expect(button('Close room')).toBeUndefined();
  });

  it('shows why the server refused', async () => {
    server.reopen.mockResolvedValue({
      ok: false,
      refusal: 'This team is read-only until billing is updated.',
    });
    await render(true);

    await click('Reopen room');

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'This team is read-only until billing is updated.',
    );
  });
});
