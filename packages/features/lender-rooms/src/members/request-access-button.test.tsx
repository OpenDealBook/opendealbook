// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({
  refusal: null as string | null,
}));

vi.mock('./actions', () => ({
  requestLenderRoomAccess: async () =>
    server.refusal
      ? { ok: false, refusal: server.refusal }
      : { ok: true, value: undefined },
}));

import { RequestAccessButton } from './request-access-button';

const ROOM = '7d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';

describe('RequestAccessButton', () => {
  let container: HTMLDivElement;
  let root: Root;

  async function ask() {
    await act(async () => {
      container.querySelector('form')!.requestSubmit();
    });
  }

  beforeEach(() => {
    server.refusal = null;
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<RequestAccessButton roomId={ROOM} />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('confirms a request the server accepted', async () => {
    await ask();

    expect(container.textContent).toBe('Your request has been sent.');
  });

  it('shows the refusal from the server as written and keeps the button', async () => {
    server.refusal = 'This room is open';

    await ask();

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'This room is open',
    );
    expect(container.querySelector('button')?.textContent).toBe(
      'Ask to reopen',
    );
  });
});
