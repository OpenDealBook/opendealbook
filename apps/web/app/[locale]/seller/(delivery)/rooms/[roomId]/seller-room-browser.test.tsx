import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
}));
const tracking = vi.hoisted(() => ({
  roomOpened: vi.fn(async () => ({ ok: true, value: undefined })),
  folderOpened: vi.fn(async () => ({ ok: true, value: undefined })),
}));

vi.mock('@odb/lender-rooms/room-browser/room-browser.tsx', () => ({
  RoomBrowser: (props: Record<string, unknown>) => {
    captured.props = props;
    return null;
  },
}));

vi.mock('@odb/seller-rooms/files/tracking-actions.ts', () => ({
  recordSellerRoomOpened: tracking.roomOpened,
  recordSellerFolderOpened: tracking.folderOpened,
}));

import { SellerRoomBrowser } from './seller-room-browser';

const room = 'a0000000-0000-4000-8000-000000000001';
const folder = (id: string) => ({ id, name: id, folders: [], entries: [] });

function render({
  teamName = 'Harbor Holdings',
  teamSize = 3,
  counselHasJoined = false,
  readOnly = false,
} = {}) {
  renderToStaticMarkup(
    <SellerRoomBrowser
      roomId={room}
      userId={'seller-1'}
      teamName={teamName}
      teamSize={teamSize}
      counselHasJoined={counselHasJoined}
      places={{ shared: folder('shared'), own: folder('uploads') }}
      readOnly={readOnly}
    />,
  );

  return captured.props!;
}

describe('SellerRoomBrowser', () => {
  it('shows the team side as "From <team>" and the seller side as Uploads', () => {
    const props = render();

    expect(props.space).toEqual({ sellerRoomId: room });
    expect(props.labels).toEqual(
      expect.objectContaining({
        shared: 'From Harbor Holdings',
        own: 'Uploads',
      }),
    );
  });

  it('names who will see an upload: the deal team and, once joined, counsel', () => {
    const consent = (options: { counselHasJoined: boolean }) =>
      (
        render(options).labels as { ownOnlyConsent: (names: string) => string }
      ).ownOnlyConsent('2025-PL.csv');

    expect(consent({ counselHasJoined: false })).toBe(
      "2025-PL.csv will go to Uploads. Harbor Holdings' deal team (3 people) will see it.",
    );
    expect(consent({ counselHasJoined: true })).toBe(
      "2025-PL.csv will go to Uploads. Harbor Holdings' deal team (3 people) and your counsel will see it.",
    );
  });

  it("writes the team's possessive and a one-person team in plain English", () => {
    const consent = (options: { teamName: string; teamSize: number }) =>
      (
        render(options).labels as { ownOnlyConsent: (names: string) => string }
      ).ownOnlyConsent('lease.pdf');

    expect(consent({ teamName: 'Acme Corp', teamSize: 1 })).toBe(
      "lease.pdf will go to Uploads. Acme Corp's deal team (1 person) will see it.",
    );
  });

  it('confirms a finished upload went to the team', () => {
    expect((render().labels as { sent: string }).sent).toBe(
      "Sent to Harbor Holdings. They've been notified.",
    );
  });

  it('records opening the room and its folders through the seller room', async () => {
    const props = render() as {
      tracking: {
        recordRoomOpened: () => Promise<unknown>;
        recordFolderOpened: (id: string) => Promise<unknown>;
      };
    };

    await props.tracking.recordRoomOpened();
    await props.tracking.recordFolderOpened('uploads');

    expect(tracking.roomOpened).toHaveBeenCalledWith({ roomId: room });
    expect(tracking.folderOpened).toHaveBeenCalledWith({
      roomId: room,
      folderId: 'uploads',
    });
  });

  it('turns off adding files once the room is read-only', () => {
    expect(render({ readOnly: true }).readOnly).toBe(true);
  });

  it('offers no request form to sellers', () => {
    expect(render().RequestComposer).toBeUndefined();
  });
});
