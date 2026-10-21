// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({
  share: vi.fn(),
  unshare: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@odb/seller-rooms/meetings/actions.ts', () => ({
  shareSellerRoomMeeting: server.share,
  unshareSellerRoomMeeting: server.unshare,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
}));

import { SellerRoomMeetings } from './seller-room-meetings';

const weekly = 'e0000000-0000-4000-8000-000000000001';
const visit = 'e0000000-0000-4000-8000-000000000002';

let container: HTMLDivElement;
let root: Root;

function box(index: number) {
  return container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[
    index
  ]!;
}

beforeEach(async () => {
  server.share.mockReset();
  server.unshare.mockReset();
  server.refresh.mockReset();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <SellerRoomMeetings
        dealId={'deal-1'}
        meetings={[
          {
            id: weekly,
            type: 'weekly',
            scheduled_at: '2026-10-01T10:00:00Z',
            shared: true,
          },
          { id: visit, type: 'site_visit', scheduled_at: null, shared: false },
        ]}
      />,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('SellerRoomMeetings', () => {
  it('reminds the team that sellers see the full transcript and summary', () => {
    expect(container.textContent).toContain(
      'Sellers see the full transcript and summary of every meeting you share.',
    );
  });

  it('shows which meetings the room shares', () => {
    expect(box(0).checked).toBe(true);
    expect(box(1).checked).toBe(false);
    expect(container.textContent).toContain('Site visit');
  });

  it('shares a meeting when the team ticks it, then refreshes', async () => {
    server.share.mockResolvedValueOnce({ ok: true, value: undefined });

    await act(async () => {
      box(1).click();
    });

    expect(server.share).toHaveBeenCalledWith({
      dealId: 'deal-1',
      meetingId: visit,
    });
    expect(server.refresh).toHaveBeenCalledTimes(1);
  });

  it('stops sharing a meeting when the team unticks it', async () => {
    server.unshare.mockResolvedValueOnce({ ok: true, value: undefined });

    await act(async () => {
      box(0).click();
    });

    expect(server.unshare).toHaveBeenCalledWith({
      dealId: 'deal-1',
      meetingId: weekly,
    });
  });

  it('says why a change was refused', async () => {
    server.share.mockResolvedValueOnce({
      ok: false,
      refusal: 'You cannot change this seller room.',
    });

    await act(async () => {
      box(1).click();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'You cannot change this seller room.',
    );
  });
});
