// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeRealtime } from './fake-realtime';

const refresh = vi.hoisted(() => vi.fn());
const realtime = fakeRealtime();

vi.mock('@odb/supabase/hooks', () => ({
  useSupabase: () => realtime.client,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { LiveRefresh } from './use-live-refresh';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  refresh.mockReset();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <LiveRefresh
        table={'seller_room_comment'}
        column={'room_id'}
        value={'room-1'}
      />,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('LiveRefresh', () => {
  it('refreshes a server-rendered page when a row it watches is posted', async () => {
    await act(() =>
      realtime.insert('seller_room_comment', {
        room_id: 'room-1',
        body: 'Check the indemnity',
      }),
    );

    expect(refresh).toHaveBeenCalled();
  });

  it('stops listening once the page leaves', async () => {
    act(() => root.unmount());

    await realtime.insert('seller_room_comment', {
      room_id: 'room-1',
      body: 'After leaving',
    });

    expect(refresh).not.toHaveBeenCalled();
    root = createRoot(container);
  });
});
