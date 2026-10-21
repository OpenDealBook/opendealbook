import { describe, expect, it } from 'vitest';

import {
  filterContacts,
  initialsOf,
  teamContacts,
  teamRooms,
} from './lender-team-rows';

const room = {
  room_id: 'room-1',
  deal_id: 'deal-1',
  deal_name: 'Harborview Tax',
  deal_description: 'Accounting firm in Ohio',
  room_name: 'First Bank',
  status: 'reviewing',
  expires_at: '2027-01-05T23:59:59.999Z',
  closed_at: null,
  is_open: true,
  brand_domain: 'firstbank.com',
  brand_name: 'First Bank',
  brand_logo_path: 'firstbank.com/logo',
  member_count: 2,
  requests_waiting_on_team: 0,
  last_lender_activity_at: '2026-10-01T10:00:00.000Z',
  last_lender_action_at: '2026-09-30T10:00:00.000Z',
};

describe('team lender rooms', () => {
  it('shapes each room for the overview row, with its deal', () => {
    expect(teamRooms([room])).toEqual([
      {
        id: 'room-1',
        dealId: 'deal-1',
        dealLabel: 'Harborview Tax',
        name: 'First Bank',
        initials: 'FB',
        logoPath: 'firstbank.com/logo',
        status: 'reviewing',
        access: { kind: 'open', expiresAt: '2027-01-05T23:59:59.999Z' },
        peopleCount: 2,
        waitingOnUs: 0,
        lastActivityAt: '2026-10-01T10:00:00.000Z',
        lastActionAt: '2026-09-30T10:00:00.000Z',
      },
    ]);
  });

  it('names the deal by its description when it has no firm name', () => {
    const [shaped] = teamRooms([{ ...room, deal_name: null }]);

    expect(shaped?.dealLabel).toBe('Accounting firm in Ohio');
  });

  it('orders rooms like the deal overview: open ones waiting on us first, closed and expired last', () => {
    expect(
      teamRooms([
        {
          ...room,
          room_id: 'closed',
          closed_at: '2026-10-02T00:00:00.000Z',
          is_open: false,
          requests_waiting_on_team: 3,
        },
        { ...room, room_id: 'quiet', last_lender_activity_at: null },
        { ...room, room_id: 'waiting', requests_waiting_on_team: 1 },
        {
          ...room,
          room_id: 'expired',
          is_open: false,
          expires_at: '2026-09-01T00:00:00.000Z',
        },
        {
          ...room,
          room_id: 'recent',
          last_lender_activity_at: '2026-10-09T10:00:00.000Z',
        },
      ]).map((each) => each.id),
    ).toEqual(['waiting', 'recent', 'quiet', 'closed', 'expired']);
  });

  it('fails loudly on a row it cannot read', () => {
    expect(() => teamRooms([{ ...room, status: 'mystery' }])).toThrow();
  });
});

const contact = {
  user_id: 'user-ana',
  email: 'ana@firstbank.com',
  name: 'Ana Diaz',
  has_signed_in: true,
  room_id: 'room-1',
  room_name: 'First Bank',
  deal_id: 'deal-1',
  deal_name: 'Harborview Tax',
  room_status: 'reviewing',
  brand_name: 'First Bank',
  brand_logo_path: 'firstbank.com/logo',
  invited_by: 'user-jordan',
  invited_by_email: 'jordan@buyer.test',
  invited_by_name: 'Jordan Reyes',
  deal_description: 'Accounting firm in Ohio',
  invited_at: '2026-09-20T09:00:00.000Z',
  removed_at: null,
  first_visit_at: '2026-09-21T09:00:00.000Z',
  last_visit_at: '2026-10-01T09:00:00.000Z',
  files_viewed: 3,
  downloads: 1,
  requests_opened: 2,
  requests_waiting_on_team: 1,
  requests_waiting_on_lender: 0,
  forms_out_for_signature: 1,
};

describe('team lender contacts', () => {
  it('orders by most recent last visit, people who never visited after', () => {
    expect(
      teamContacts([
        {
          ...contact,
          user_id: 'never',
          first_visit_at: null,
          last_visit_at: null,
          has_signed_in: false,
        },
        {
          ...contact,
          user_id: 'older',
          last_visit_at: '2026-09-25T09:00:00.000Z',
        },
        {
          ...contact,
          user_id: 'newer',
          last_visit_at: '2026-10-05T09:00:00.000Z',
        },
      ]).map((each) => each.userId),
    ).toEqual(['newer', 'older', 'never']);
  });

  it('names who invited each person, by name else email, and the deal by description when it has no firm', () => {
    const [named, unnamed] = teamContacts([
      contact,
      {
        ...contact,
        user_id: 'user-raj',
        invited_by_name: null,
        deal_name: null,
        last_visit_at: null,
      },
    ]);

    expect(named?.invitedBy).toBe('Jordan Reyes');
    expect(named?.dealLabel).toBe('Harborview Tax');
    expect(unnamed?.invitedBy).toBe('jordan@buyer.test');
    expect(unnamed?.dealLabel).toBe('Accounting firm in Ohio');
  });

  it('orders people who never visited by name, else email', () => {
    const never = {
      first_visit_at: null,
      last_visit_at: null,
      has_signed_in: false,
    };

    expect(
      teamContacts([
        {
          ...contact,
          ...never,
          user_id: 'zed',
          name: 'Zed Young',
          email: 'a@x.com',
        },
        {
          ...contact,
          ...never,
          user_id: 'mail-only',
          name: null,
          email: 'b@x.com',
        },
        {
          ...contact,
          ...never,
          user_id: 'amy',
          name: 'Amy Bell',
          email: 'z@x.com',
        },
        { ...contact, user_id: 'visited' },
      ]).map((each) => each.userId),
    ).toEqual(['visited', 'amy', 'mail-only', 'zed']);
  });

  it('keeps a removed person with their removal date', () => {
    const [removed] = teamContacts([
      {
        ...contact,
        invited_by: null,
        invited_by_email: null,
        invited_by_name: null,
        removed_at: '2026-10-03T09:00:00.000Z',
      },
    ]);

    expect(removed?.removedAt).toBe('2026-10-03T09:00:00.000Z');
  });
});

describe('filtering contacts', () => {
  const rows = teamContacts([
    contact,
    {
      ...contact,
      user_id: 'user-raj',
      email: 'raj@harbor.coop',
      name: null,
      brand_name: 'Harbor Credit Union',
      deal_name: 'Summit Dental',
    },
  ]);

  it.each([
    ['ana', ['user-ana']],
    ['HARBOR.COOP', ['user-raj']],
    ['credit union', ['user-raj']],
    ['summit', ['user-raj']],
    ['', ['user-ana', 'user-raj']],
  ])('"%s" keeps %j', (text, expected) => {
    expect(
      filterContacts(rows, text)
        .map((each) => each.userId)
        .toSorted(),
    ).toEqual(expected);
  });
});

describe('initials', () => {
  it('takes the first letter of up to two words', () => {
    expect(initialsOf('harbor credit union')).toBe('HC');
    expect(initialsOf('Chase')).toBe('C');
  });
});
