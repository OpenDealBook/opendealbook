// @vitest-environment jsdom
import { useState } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LenderRoomLifecycle,
  type LifecycleRoom,
} from './lender-room-lifecycle';
import { LenderRoomPeople } from './lender-room-people';
import {
  alerts,
  announced,
  button,
  buttonNames,
  clearScreen,
  dialogText,
  field,
  pageText,
  press,
  fakeServer,
  show,
  type,
} from './lender-test-kit';

vi.mock(
  'next/navigation',
  async () => (await import('./lender-test-kit')).navigation,
);
vi.mock('@odb/lender-rooms/rooms/actions.ts', async () =>
  (await import('./lender-test-kit')).fakeActions(
    'setLenderRoomStatus',
    'setLenderRoomExpiry',
    'closeLenderRoom',
    'reopenLenderRoom',
    'setLenderRoomWelcomeNote',
  ),
);
vi.mock('@odb/lender-rooms/members/actions.ts', async () =>
  (await import('./lender-test-kit')).fakeActions(
    'inviteLenderMember',
    'removeLenderMember',
  ),
);

const ROOM = '7d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';

const reviewing: LifecycleRoom = {
  id: ROOM,
  name: 'First Bank',
  status: 'reviewing',
  access: { kind: 'open', expiresAt: '2027-01-05T23:59:59.999Z' },
  welcomeNote: 'Welcome aboard',
};

beforeEach(() => {
  fakeServer.reset();
});

afterEach(clearScreen);

describe('room status and lifecycle', () => {
  it('sets the status by hand and asks the server for the room again', async () => {
    show(<LenderRoomLifecycle room={reviewing} />);

    expect(button('Reviewing').getAttribute('aria-pressed')).toBe('true');
    expect(pageText()).toContain('Expires Jan 5, 2027');

    await press('Selected');

    expect(fakeServer.inputsTo('setLenderRoomStatus')).toEqual([
      { roomId: ROOM, status: 'selected' },
    ]);
    expect(fakeServer.refreshes).toBe(1);
  });

  it('shows the expiry the server holds, such as none once selected', () => {
    show(
      <LenderRoomLifecycle
        room={{
          ...reviewing,
          status: 'selected',
          access: { kind: 'open', expiresAt: null },
        }}
      />,
    );

    expect(button('Selected').getAttribute('aria-pressed')).toBe('true');
    expect(pageText()).toContain('No expiry');
  });

  it('saves a new expiry date', async () => {
    show(<LenderRoomLifecycle room={reviewing} />);

    await type('Expiry date', '2027-02-01');
    await press('Save expiry');

    expect(fakeServer.inputsTo('setLenderRoomExpiry')).toEqual([
      {
        roomId: ROOM,
        date: '2027-02-01',
        timeZone: 'UTC',
      },
    ]);
    expect(fakeServer.refreshes).toBe(1);
  });

  it('shows a refusal as given and leaves the room as it was', async () => {
    fakeServer.refusal = 'A selected room has no expiry';
    show(<LenderRoomLifecycle room={reviewing} />);

    await type('Expiry date', '2027-02-01');
    await press('Save expiry');

    expect(alerts()).toEqual(['A selected room has no expiry']);
    expect(fakeServer.refreshes).toBe(0);
  });

  it('closes an open room', async () => {
    show(<LenderRoomLifecycle room={reviewing} />);

    expect(pageText()).toContain('Open');
    expect(buttonNames()).not.toContain('Reopen room');

    await press('Close room');

    expect(dialogText()).toContain('Close the First Bank room?');
    expect(dialogText()).toContain('lose access immediately');
    expect(fakeServer.inputsTo('closeLenderRoom')).toEqual([]);

    await press('Close this room');

    expect(fakeServer.inputsTo('closeLenderRoom')).toEqual([{ roomId: ROOM }]);
    expect(fakeServer.refreshes).toBe(1);
  });

  it('reopens a closed room', async () => {
    show(
      <LenderRoomLifecycle
        room={{ ...reviewing, access: { kind: 'closed' } }}
      />,
    );

    expect(pageText()).toContain('Closed');
    expect(buttonNames()).not.toContain('Close room');

    await press('Reopen room');

    expect(fakeServer.inputsTo('reopenLenderRoom')).toEqual([{ roomId: ROOM }]);
    expect(fakeServer.refreshes).toBe(1);
  });

  it('says an expired room expired, and when', () => {
    show(
      <LenderRoomLifecycle
        room={{
          ...reviewing,
          access: { kind: 'expired', expiredAt: '2026-09-01T23:59:59.999Z' },
        }}
      />,
    );

    expect(pageText()).toContain('Expired on Sep 1, 2026');
    expect(pageText()).not.toContain('Expires');
    expect(buttonNames()).toContain('Reopen room');
  });

  it('saves the welcome note', async () => {
    show(<LenderRoomLifecycle room={reviewing} />);

    await type('Welcome note', 'Glad to have you');
    await press('Save welcome note');

    expect(fakeServer.inputsTo('setLenderRoomWelcomeNote')).toEqual([
      { roomId: ROOM, welcomeNote: 'Glad to have you' },
    ]);
  });
});

const members = [
  {
    id: 'member-1',
    email: 'ana@firstbank.com',
    name: 'Ana Diaz',
    created_at: '2026-10-01T09:00:00.000Z',
    firstOpenedAt: '2026-10-02T09:00:00.000Z',
    lastVisitAt: '2026-10-09T09:00:00.000Z',
    filesViewed: 2,
    downloads: 1,
  },
  {
    id: 'member-2',
    email: 'raj@firstbank.com',
    name: null,
    created_at: '2026-10-02T09:00:00.000Z',
    firstOpenedAt: null,
    lastVisitAt: null,
    filesViewed: 0,
    downloads: 0,
  },
];

describe('people in a room', () => {
  it('shows what each person has done in the room', () => {
    show(<LenderRoomPeople roomId={ROOM} members={members} removed={[]} />);

    const [ana, raj] = [...document.querySelectorAll('li')].map((row) =>
      (row.textContent ?? '').replace(/\s+/g, ' '),
    );

    expect(ana).toContain('Ana Diaz (ana@firstbank.com)');
    expect(raj).toContain('raj@firstbank.com');
    expect(raj).not.toContain('(raj@firstbank.com)');
    expect(ana).toMatch(/First opened the room .*Oct 2, 2026/);
    expect(ana).toMatch(/Last visit .*Oct 9, 2026/);
    expect(ana).toContain('2 files viewed');
    expect(ana).toContain('1 download');
    expect(raj).toContain('Has not opened the room yet');
    expect(raj).not.toContain('Last visit');
  });

  it('keeps removed people visible with what they did and when they were removed', () => {
    show(
      <LenderRoomPeople
        roomId={ROOM}
        members={members}
        removed={[
          {
            userId: 'user-lee',
            email: 'lee@firstbank.com',
            name: 'Lee Park',
            invitedAt: '2026-09-20T09:00:00.000Z',
            removedAt: '2026-10-05T09:00:00.000Z',
            firstOpenedAt: '2026-09-21T09:00:00.000Z',
            lastVisitAt: '2026-10-01T09:00:00.000Z',
            filesViewed: 3,
            downloads: 1,
          },
        ]}
      />,
    );

    const removedSection = document.querySelector(
      '[aria-labelledby="removed-people"]',
    );
    const text = (removedSection?.textContent ?? '').replace(/\s+/g, ' ');

    expect(text).toContain('Removed');
    expect(text).toContain('Lee Park (lee@firstbank.com)');
    expect(text).toMatch(/Invited .*Sep 20, 2026/);
    expect(text).toMatch(/Removed .*Oct 5, 2026/);
    expect(text).toContain('3 files viewed');
    expect(text).toContain('1 download');
    expect(buttonNames()).not.toContain('Resend link to lee@firstbank.com');
    expect(buttonNames()).not.toContain('Remove lee@firstbank.com');
  });

  it('shows no removed section when nobody has been removed', () => {
    show(<LenderRoomPeople roomId={ROOM} members={members} removed={[]} />);

    expect(
      document.querySelector('[aria-labelledby="removed-people"]'),
    ).toBeNull();
  });

  it('invites a person by email', async () => {
    show(<LenderRoomPeople roomId={ROOM} members={members} removed={[]} />);

    await type('Email', 'lee@firstbank.com');
    await type('Name (optional)', 'Lee Park');
    await press('Invite');

    expect(fakeServer.inputsTo('inviteLenderMember')).toEqual([
      { roomId: ROOM, email: 'lee@firstbank.com', name: 'Lee Park' },
    ]);
    expect(announced()).toEqual(['Invite sent to lee@firstbank.com']);
    expect(fakeServer.refreshes).toBe(1);
  });

  it('resends a sign-in link to someone already in the room', async () => {
    show(<LenderRoomPeople roomId={ROOM} members={members} removed={[]} />);

    await press('Resend link to raj@firstbank.com');

    expect(fakeServer.inputsTo('inviteLenderMember')).toEqual([
      { roomId: ROOM, email: 'raj@firstbank.com' },
    ]);
    expect(announced()).toEqual(['Link sent to raj@firstbank.com']);
  });

  it('removes a person only after the team confirms, saying their activity stays', async () => {
    show(<LenderRoomPeople roomId={ROOM} members={members} removed={[]} />);

    await press('Remove ana@firstbank.com');

    expect(dialogText()).toContain('ana@firstbank.com');
    expect(dialogText()).toContain('lose access immediately');
    expect(dialogText()).toContain(
      'Their past activity, requests, and messages stay',
    );
    expect(fakeServer.inputsTo('removeLenderMember')).toEqual([]);

    await press('Remove person');

    expect(fakeServer.inputsTo('removeLenderMember')).toEqual([
      { memberId: 'member-1' },
    ]);
    expect(fakeServer.refreshes).toBe(1);
  });

  it('reloads the people after a refusal, since a refused invite may still have been saved', async () => {
    fakeServer.refusal =
      'The invite was saved but the email could not be sent. Send it again.';
    show(<LenderRoomPeople roomId={ROOM} members={members} removed={[]} />);

    await type('Email', 'lee@firstbank.com');
    await press('Invite');

    expect(alerts()).toEqual([
      'The invite was saved but the email could not be sent. Send it again.',
    ]);
    expect(fakeServer.refreshes).toBe(1);
  });

  it('clears the invite fields once the person appears in the room, even when the email was refused', async () => {
    fakeServer.refusal =
      'The invite was saved but the email could not be sent. Send it again.';

    function RoomAfterRefresh() {
      const [shown, setShown] = useState(members);

      fakeServer.onRefresh = () =>
        setShown([
          ...members,
          { ...members[1]!, id: 'member-3', email: 'lee@firstbank.com' },
        ]);

      return <LenderRoomPeople roomId={ROOM} members={shown} removed={[]} />;
    }

    show(<RoomAfterRefresh />);

    await type('Email', 'lee@firstbank.com');
    await type('Name (optional)', 'Lee Park');
    await press('Invite');

    expect(field('Email').value).toBe('');
    expect(field('Name (optional)').value).toBe('');
  });

  it('keeps the invite fields when the person was not added', async () => {
    fakeServer.refusal =
      'This room already has 25 people, the most it can hold.';
    show(<LenderRoomPeople roomId={ROOM} members={members} removed={[]} />);

    await type('Email', 'lee@firstbank.com');
    await type('Name (optional)', 'Lee Park');
    await press('Invite');

    expect(field('Email').value).toBe('lee@firstbank.com');
    expect(field('Name (optional)').value).toBe('Lee Park');
  });

  it('shows a limit refusal as given', async () => {
    fakeServer.refusal =
      'This room already has 25 people, the most it can hold.';
    show(<LenderRoomPeople roomId={ROOM} members={members} removed={[]} />);

    await type('Email', 'lee@firstbank.com');
    await press('Invite');

    expect(alerts()).toEqual([
      'This room already has 25 people, the most it can hold.',
    ]);
  });
});
