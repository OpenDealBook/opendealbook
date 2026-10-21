import { describe, expect, it } from 'vitest';

import { type DealPerson, resolveRecipients } from './groups';
import type { RecipientGroup } from './schema';

const quiet = {
  phone: null,
  company: null,
  lender_room_id: null,
  room_closed: null,
  is_main: false,
};

type PulledEntry = Extract<DealPerson['entries'][number], { contact_id: null }>;

function pulled(
  name: string,
  entry: Pick<PulledEntry, 'source' | 'side' | 'role'> &
    Partial<Pick<PulledEntry, 'lender_room_id' | 'room_closed'>>,
): DealPerson {
  const userId = `u-${name}`;

  return {
    user_id: userId,
    email: `${name}@deal.test`,
    name,
    entries: [{ ...quiet, ...entry, name, contact_id: null, user_id: userId }],
  };
}

function contact(
  name: string,
  side: 'buyer' | 'seller' | 'lender',
  role: 'principal' | 'attorney' | 'broker' | 'cpa' | 'other',
  email: string | null = `${name}@deal.test`,
): Extract<DealPerson, { user_id: null }> {
  return {
    user_id: null,
    email,
    name,
    entries: [
      {
        ...quiet,
        source: 'contact',
        contact_id: `c-${name}`,
        name,
        side,
        role,
      },
    ],
  };
}

const ada = pulled('ada', { source: 'team', side: 'buyer', role: 'principal' });
const lou = pulled('lou', {
  source: 'lender_room',
  side: 'lender',
  role: 'lender',
  lender_room_id: 'r-open',
  room_closed: false,
});
const lia = pulled('lia', {
  source: 'lender_room',
  side: 'lender',
  role: 'lender',
  lender_room_id: 'r-declined',
  room_closed: true,
});
const sam = pulled('sam', {
  source: 'seller_room',
  side: 'seller',
  role: 'seller',
  room_closed: false,
});
const sid = pulled('sid', {
  source: 'seller_room',
  side: 'seller',
  role: 'seller',
  room_closed: true,
});
const bo = pulled('bo', { source: 'counsel', side: 'buyer', role: 'attorney' });
const cy = contact('cy', 'seller', 'attorney');
const bea = contact('bea', 'seller', 'broker');
const ed = contact('ed', 'seller', 'broker', null);
const cal = contact('cal', 'buyer', 'cpa');
const sue = contact('sue', 'seller', 'principal');
const val = contact('val', 'seller', 'cpa');

const people = [ada, lou, lia, sam, sid, bo, cy, bea, ed, cal, sue, val];

function emailsFor(groups: RecipientGroup[], individuals: string[] = []) {
  return resolveRecipients(people, { groups, people: individuals }).map(
    (recipient) => recipient.email,
  );
}

describe('resolveRecipients', () => {
  it.each<[RecipientGroup, string[]]>([
    ['team', ['ada@deal.test']],
    ['lenders', ['lou@deal.test']],
    ['sellers', ['sam@deal.test', 'sue@deal.test']],
    ['buyers_counsel', ['bo@deal.test']],
    ['sellers_counsel', ['cy@deal.test']],
    ['brokers', ['bea@deal.test']],
  ])('resolves the %s group to its open, emailed people', (group, emails) => {
    expect(emailsFor([group])).toEqual(emails);
  });

  it('keeps a team member whose role reads broker out of brokers', () => {
    const tim = pulled('tim', { source: 'team', side: 'buyer', role: 'broker' });

    expect(
      resolveRecipients([tim, bea], { groups: ['brokers'], people: [] }).map(
        (recipient) => recipient.email,
      ),
    ).toEqual(['bea@deal.test']);
  });

  it('keeps a team member whose role reads attorney out of counsel groups', () => {
    const tia = pulled('tia', { source: 'team', side: 'buyer', role: 'attorney' });
    const tom = pulled('tom', {
      source: 'team',
      side: 'seller',
      role: 'attorney',
    });

    expect(
      resolveRecipients([tia, tom, bo, cy], {
        groups: ['buyers_counsel', 'sellers_counsel'],
        people: [],
      }).map((recipient) => recipient.email),
    ).toEqual(['bo@deal.test', 'cy@deal.test']);
  });

  it('includes a person without open access when picked by name', () => {
    expect(emailsFor(['lenders'], ['lia@deal.test', 'sid@deal.test'])).toEqual([
      'lou@deal.test',
      'lia@deal.test',
      'sid@deal.test',
    ]);
  });

  it('includes someone in no group when picked by name', () => {
    expect(emailsFor([], ['cal@deal.test'])).toEqual(['cal@deal.test']);
  });

  it('resolves nothing from no picks', () => {
    expect(emailsFor([])).toEqual([]);
  });

  it('lists a person once however many picks reach them', () => {
    const both = contact('bea', 'seller', 'broker');
    both.entries.push(...contact('bea', 'seller', 'attorney').entries);

    const recipients = resolveRecipients([both], {
      groups: ['brokers', 'sellers_counsel'],
      people: ['bea@deal.test'],
    });

    expect(recipients).toEqual([
      {
        user_id: null,
        contact_id: 'c-bea',
        email: 'bea@deal.test',
        name: 'bea',
        entries: both.entries,
      },
    ]);
  });

  it('keys a signed-in person by user and a hand-added one by contact', () => {
    expect(
      resolveRecipients([ada, bea], {
        groups: ['team', 'brokers'],
        people: [],
      }).map(({ user_id, contact_id }) => ({ user_id, contact_id })),
    ).toEqual([
      { user_id: 'u-ada', contact_id: null },
      { user_id: null, contact_id: 'c-bea' },
    ]);
  });
});
