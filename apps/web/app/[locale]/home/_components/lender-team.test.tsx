// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LenderTeamContacts } from './lender-team-contacts';
import { LenderTeamRooms } from './lender-team-rooms';
import type { TeamContact } from './lender-team-rows';
import { LenderTeamSubnav } from './lender-team-subnav';
import {
  clearScreen,
  fakeServer,
  linkTo,
  pageText,
  press,
  show,
  type,
} from './lender-test-kit';

vi.mock(
  'next/navigation',
  async () => (await import('./lender-test-kit')).navigation,
);

const TEAM = '/home/team-one/lenders';

beforeEach(() => fakeServer.reset());

afterEach(clearScreen);

const rowText = () =>
  [...document.querySelectorAll('li, tbody tr')].map((row) =>
    (row.textContent ?? '').replace(/\s+/g, ' '),
  );

describe('the team Lenders subtabs', () => {
  it('links Rooms and Contacts and marks the one open', () => {
    fakeServer.pathname = `${TEAM}/contacts`;
    show(<LenderTeamSubnav basePath={TEAM} />);

    expect(linkTo('Rooms')).toBe(TEAM);
    expect(linkTo('Contacts')).toBe(`${TEAM}/contacts`);
    expect(document.querySelector('a[aria-current="page"]')?.textContent).toBe(
      'Contacts',
    );
  });
});

describe('every lender room across the team', () => {
  it('shows each room with its deal and opens that deal room', () => {
    show(
      <LenderTeamRooms
        teamPath={'/home/team-one'}
        rows={[
          {
            id: 'room-1',
            dealId: 'deal-1',
            dealLabel: 'Harborview Tax',
            name: 'First Bank',
            initials: 'FB',
            logoUrl: null,
            status: 'term_sheet',
            access: { kind: 'open', expiresAt: null },
            peopleCount: 2,
            waitingOnUs: 1,
            lastActivityAt: null,
          },
        ]}
      />,
    );

    const [row] = rowText();

    expect(row).toContain('First Bank');
    expect(row).toContain('Harborview Tax');
    expect(row).toContain('Term sheet');
    expect(row).toContain('Open');
    expect(row).toContain('1 request waiting on us');
    expect(linkTo('First Bank')).toBe(
      '/home/team-one/deals/deal-1/lenders/room-1',
    );
  });

  it('shows open rooms first and the closed and expired ones on request', async () => {
    const room = {
      id: 'room-1',
      dealId: 'deal-1',
      dealLabel: 'Harborview Tax',
      name: 'First Bank',
      initials: 'FB',
      logoUrl: null,
      status: 'reviewing' as const,
      access: { kind: 'open' as const, expiresAt: null },
      peopleCount: 1,
      waitingOnUs: 0,
      lastActivityAt: null,
    };

    show(
      <LenderTeamRooms
        teamPath={'/home/team-one'}
        rows={[
          room,
          {
            ...room,
            id: 'room-2',
            name: 'Harbor CU',
            access: { kind: 'closed' },
          },
        ]}
      />,
    );

    expect(rowText()).toHaveLength(1);
    expect(pageText()).not.toContain('Harbor CU');

    await press('Show closed and expired');

    expect(rowText()).toHaveLength(2);
    expect(rowText()[1]).toContain('Harbor CU');
  });

  it('says where to start when there are no rooms', () => {
    show(<LenderTeamRooms teamPath={'/home/team-one'} rows={[]} />);

    expect(pageText()).toContain('No lender rooms on any deal yet');
  });
});

const ana: TeamContact & { logoUrl: string | null } = {
  userId: 'user-ana',
  email: 'ana@firstbank.com',
  name: 'Ana Diaz',
  hasSignedIn: true,
  roomId: 'room-1',
  roomName: 'First Bank',
  dealId: 'deal-1',
  dealLabel: 'Harborview Tax',
  roomStatus: 'reviewing',
  institution: 'First Bank',
  logoPath: null,
  logoUrl: null,
  invitedBy: 'Zac Clifton',
  invitedAt: '2026-09-20T09:00:00.000Z',
  removedAt: null,
  firstVisitAt: '2026-09-21T09:00:00.000Z',
  lastVisitAt: '2026-10-01T09:00:00.000Z',
  filesViewed: 3,
  downloads: 1,
  requestsOpened: 2,
  waitingOnTeam: 1,
  waitingOnLender: 0,
  formsOutForSignature: 1,
};

const raj: TeamContact & { logoUrl: string | null } = {
  ...ana,
  userId: 'user-raj',
  email: 'raj@harbor.coop',
  name: null,
  hasSignedIn: false,
  institution: 'Harbor Credit Union',
  dealLabel: 'Summit Dental',
  invitedBy: null,
  removedAt: '2026-10-03T09:00:00.000Z',
  firstVisitAt: null,
  lastVisitAt: null,
};

describe('every lender person across the team', () => {
  it('shows what each person has done in their room', () => {
    show(<LenderTeamContacts teamPath={'/home/team-one'} rows={[ana, raj]} />);

    const [first, second] = rowText();

    expect(first).toContain('Ana Diaz (ana@firstbank.com)');
    expect(first).toContain('First Bank');
    expect(first).toContain('Harborview Tax');
    expect(first).toContain('Reviewing');
    expect(first).toContain('Signed in');
    expect(first).toMatch(/Invited by Zac Clifton on .*Sep 20, 2026/);
    expect(first).toMatch(/First visit .*Sep 21, 2026/);
    expect(first).toMatch(/Last visit .*Oct 1, 2026/);
    expect(first).toContain('3 files viewed');
    expect(first).toContain('1 download');
    expect(first).toContain('2 requests opened');
    expect(first).toContain('1 request waiting on us');
    expect(first).toContain('No requests waiting on the lender');
    expect(first).toContain('1 form out for signature');
    expect(linkTo('First Bank')).toBe(
      '/home/team-one/deals/deal-1/lenders/room-1?tab=people',
    );

    expect(second).toContain('raj@harbor.coop');
    expect(second).toContain('Not signed in yet');
    expect(second).toMatch(/Removed .*Oct 3, 2026/);
    expect(second).not.toContain('Last visit');
    expect(second).toMatch(/Invited .*Sep 20, 2026/);
    expect(second).not.toContain('Invited by');
  });

  it('filters by name, email, institution or deal', async () => {
    show(<LenderTeamContacts teamPath={'/home/team-one'} rows={[ana, raj]} />);

    await type('Filter people', 'summit');

    expect(rowText()).toHaveLength(1);
    expect(rowText()[0]).toContain('raj@harbor.coop');
  });

  it('says when nobody matches the filter', async () => {
    show(<LenderTeamContacts teamPath={'/home/team-one'} rows={[ana, raj]} />);

    await type('Filter people', 'nobody');

    expect(pageText()).toContain('No people match "nobody"');
  });

  it('says how to add people when no lender has been invited anywhere', () => {
    show(<LenderTeamContacts teamPath={'/home/team-one'} rows={[]} />);

    expect(pageText()).toContain('No lender people yet');
    expect(pageText()).toContain(
      "Invite people from a lender room's People tab",
    );
  });
});
