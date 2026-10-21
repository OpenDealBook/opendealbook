import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  admin,
  ANON_KEY,
  cleanUp,
  newDeal,
  provisionPerson,
  provisionTeam,
  SERVICE_ROLE_KEY,
  SUPABASE_URL,
  withLockedTeam,
} from '@odb/seller-rooms/test-support/world.ts';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);

const world = vi.hoisted(() => ({ signedInClient: null as unknown }));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => world.signedInClient,
}));

const {
  addDealContact,
  attachDealContact,
  editDealContact,
  removeDealContact,
  starMainContact,
  unstarMainContact,
} = await import('./actions');
const { loadDealPeople } = await import('./queries');

type Person = Awaited<ReturnType<typeof provisionPerson>>;

const NOT_ALLOWED = 'You cannot edit the people on this deal.';
const READ_ONLY = 'This team is read-only until billing is updated.';
const NO_FIELDS = { company: '', phone: '', email: '' };

let owner: Person;
let member: Person;
let teamId: string;
let dealId: string;
let otherTeamId: string;

function signIn(person: Person) {
  world.signedInClient = person.client;
}

async function personNamed(name: string) {
  const { people } = await loadDealPeople({ dealId, accountId: teamId });

  return people.find((person) => person.name === name);
}

async function contactIdOf(name: string) {
  const person = await personNamed(name);

  return person!.entries[0]!.contact_id!;
}

beforeAll(async () => {
  owner = await provisionPerson();
  member = await provisionPerson();
  teamId = await provisionTeam(owner, 'People Partners');
  dealId = await newDeal(teamId, owner);

  await admin
    .from('accounts_memberships')
    .insert({
      account_id: teamId,
      user_id: member.userId,
      account_role: 'member',
    })
    .throwOnError();
});

afterAll(async () => {
  await cleanUp([teamId, otherTeamId]);
});

describe('deal people', () => {
  it('adds a hand-added contact that the list shows with its details', async () => {
    signIn(owner);

    const result = await addDealContact({
      dealId,
      name: 'Bea Broker',
      role: 'broker',
      side: 'seller',
      company: 'Main Street Brokers',
      phone: '555-0101',
      email: 'bea@brokers.test',
    });

    expect(result).toEqual({ ok: true, value: undefined });
    const bea = await personNamed('Bea Broker');
    expect(bea?.email).toBe('bea@brokers.test');
    expect(bea?.entries).toEqual([
      expect.objectContaining({
        source: 'contact',
        role: 'broker',
        side: 'seller',
        company: 'Main Street Brokers',
        phone: '555-0101',
        is_main: false,
      }),
    ]);
  });

  it('refuses a contact without a name', async () => {
    signIn(owner);

    const result = await addDealContact({
      dealId,
      name: '  ',
      role: 'cpa',
      side: 'buyer',
      company: '',
      phone: '',
      email: '',
    });

    expect(result).toEqual({ ok: false, refusal: 'Give the contact a name.' });
  });

  it('adds a contact with a name and role only', async () => {
    signIn(owner);

    await addDealContact({
      dealId,
      name: 'Cal Accountant',
      role: 'cpa',
      side: 'buyer',
      company: '',
      phone: '',
      email: '',
    });

    const cal = await personNamed('Cal Accountant');
    expect(cal?.email).toBeNull();
    expect(cal?.entries[0]).toEqual(
      expect.objectContaining({ phone: null, company: null, role: 'cpa' }),
    );
  });

  it('edits a contact, including moving its side', async () => {
    signIn(owner);
    const contactId = await contactIdOf('Cal Accountant');

    await editDealContact({
      dealId,
      contactId,
      name: 'Cal Counts',
      role: 'other',
      side: 'seller',
      company: 'Counts LLP',
      phone: '555-0199',
      email: 'cal@counts.test',
    });

    const cal = await personNamed('Cal Counts');
    expect(cal?.email).toBe('cal@counts.test');
    expect(cal?.entries[0]).toEqual(
      expect.objectContaining({
        role: 'other',
        side: 'seller',
        company: 'Counts LLP',
        phone: '555-0199',
      }),
    );
  });

  it('stars one main contact per side, replacing the last', async () => {
    signIn(owner);
    const beaId = await contactIdOf('Bea Broker');
    const calId = await contactIdOf('Cal Counts');

    await starMainContact({
      dealId,
      side: 'seller',
      lenderRoomId: null,
      who: { contactId: beaId },
    });
    await starMainContact({
      dealId,
      side: 'seller',
      lenderRoomId: null,
      who: { contactId: calId },
    });

    expect((await personNamed('Bea Broker'))?.entries[0]?.is_main).toBe(false);
    expect((await personNamed('Cal Counts'))?.entries[0]?.is_main).toBe(true);
  });

  it('stars a team member as the buyer main contact', async () => {
    signIn(owner);

    await starMainContact({
      dealId,
      side: 'buyer',
      lenderRoomId: null,
      who: { userId: owner.userId },
    });

    const { people } = await loadDealPeople({ dealId, accountId: teamId });
    const me = people.find((person) => person.user_id === owner.userId);
    expect(me?.entries).toEqual([
      expect.objectContaining({
        source: 'team',
        side: 'buyer',
        role: 'owner',
        is_main: true,
      }),
    ]);
  });

  it('clears a star', async () => {
    signIn(owner);

    await unstarMainContact({ dealId, side: 'seller', lenderRoomId: null });

    expect((await personNamed('Cal Counts'))?.entries[0]?.is_main).toBe(false);
  });

  it('removes a contact from the deal but keeps it in the address book', async () => {
    signIn(owner);
    const beaId = await contactIdOf('Bea Broker');

    await removeDealContact({ dealId, contactId: beaId });

    expect(await personNamed('Bea Broker')).toBeUndefined();
    const { data: kept } = await admin
      .from('contact')
      .select('name')
      .eq('id', beaId)
      .single()
      .throwOnError();
    expect(kept.name).toBe('Bea Broker');
  });

  it('lets a team member without deals.manage see the list but not edit it', async () => {
    signIn(member);

    const { people, canEdit } = await loadDealPeople({
      dealId,
      accountId: teamId,
    });

    expect(canEdit).toBe(false);
    expect(people.map((person) => person.name)).toContain('Cal Counts');
  });

  it('tells a manager they can edit', async () => {
    signIn(owner);

    expect((await loadDealPeople({ dealId, accountId: teamId })).canEdit).toBe(
      true,
    );
  });

  it('refuses edits from a team member without deals.manage', async () => {
    signIn(member);

    expect(
      await addDealContact({
        dealId,
        name: 'Nope Person',
        role: 'other',
        side: 'buyer',
        ...NO_FIELDS,
      }),
    ).toEqual({ ok: false, refusal: NOT_ALLOWED });
    expect(
      await starMainContact({
        dealId,
        side: 'buyer',
        lenderRoomId: null,
        who: { userId: member.userId },
      }),
    ).toEqual({ ok: false, refusal: NOT_ALLOWED });
    expect(await personNamed('Nope Person')).toBeUndefined();
  });

  it('refuses edits while the team is locked', async () => {
    signIn(owner);

    await withLockedTeam(teamId, async () => {
      expect(
        await addDealContact({
          dealId,
          name: 'Locked Out',
          role: 'other',
          side: 'buyer',
          ...NO_FIELDS,
        }),
      ).toEqual({ ok: false, refusal: READ_ONLY });
      expect(
        await unstarMainContact({ dealId, side: 'buyer', lenderRoomId: null }),
      ).toEqual({ ok: false, refusal: READ_ONLY });
    });
  });

  it('offers address book contacts not yet on the deal, and attaches one', async () => {
    signIn(owner);
    const { data: dee } = await admin
      .from('contact')
      .insert({
        account_id: teamId,
        name: 'Dee Dealer',
        email: 'dee@dealers.test',
        company: 'Dealers Inc',
      })
      .select('id')
      .single()
      .throwOnError();

    const before = await loadDealPeople({ dealId, accountId: teamId });
    expect(before.addressBook).toContainEqual({
      id: dee.id,
      name: 'Dee Dealer',
      email: 'dee@dealers.test',
      company: 'Dealers Inc',
    });
    expect(before.addressBook.map((contact) => contact.name)).not.toContain(
      'Cal Counts',
    );

    expect(
      await attachDealContact({
        dealId,
        contactId: dee.id,
        role: 'principal',
        side: 'seller',
      }),
    ).toEqual({ ok: true, value: undefined });

    const after = await loadDealPeople({ dealId, accountId: teamId });
    expect(
      after.people.find((person) => person.name === 'Dee Dealer')?.entries,
    ).toEqual([
      expect.objectContaining({
        source: 'contact',
        contact_id: dee.id,
        role: 'principal',
        side: 'seller',
        company: 'Dealers Inc',
      }),
    ]);
    expect(after.addressBook.map((contact) => contact.id)).not.toContain(
      dee.id,
    );
  });

  it('sorts by side, then main contact, then name', async () => {
    signIn(owner);
    const sortDealId = await newDeal(teamId, owner);
    const add = (name: string, side: 'buyer' | 'seller' | 'lender') =>
      addDealContact({
        dealId: sortDealId,
        name,
        role: 'other',
        side,
        ...NO_FIELDS,
      });

    await add('Lia Loan', 'lender');
    await add('Amy Ames', 'seller');
    await add('Bob Main', 'seller');
    await add('Zed Zane', 'buyer');
    await add('Al Able', 'buyer');
    const contactId = async (name: string) =>
      (
        await loadDealPeople({ dealId: sortDealId, accountId: teamId })
      ).people.find((person) => person.name === name)!.entries[0]!.contact_id!;
    await starMainContact({
      dealId: sortDealId,
      side: 'seller',
      lenderRoomId: null,
      who: { contactId: await contactId('Bob Main') },
    });
    await starMainContact({
      dealId: sortDealId,
      side: 'buyer',
      lenderRoomId: null,
      who: { contactId: await contactId('Zed Zane') },
    });

    const { people } = await loadDealPeople({
      dealId: sortDealId,
      accountId: teamId,
    });
    const order = people.map((person) => person.user_id ?? person.name);

    expect(
      order.filter((key) => key !== member.userId && key !== owner.userId),
    ).toEqual(['Zed Zane', 'Al Able', 'Bob Main', 'Amy Ames', 'Lia Loan']);
    expect(order.indexOf(owner.userId)).toBeGreaterThan(
      order.indexOf('Zed Zane'),
    );
    expect(order.indexOf(owner.userId)).toBeLessThan(order.indexOf('Bob Main'));
  });

  it("refuses to touch another team's contact through this deal", async () => {
    signIn(owner);
    otherTeamId = await provisionTeam(owner, 'Other Partners');
    const { data: other } = await admin
      .from('contact')
      .insert({ account_id: otherTeamId, name: 'Olive Other' })
      .select('id')
      .single()
      .throwOnError();
    const refused = { ok: false, refusal: NOT_ALLOWED };

    expect(
      await editDealContact({
        dealId,
        contactId: other.id,
        name: 'Hijacked',
        role: 'other',
        side: 'buyer',
        ...NO_FIELDS,
      }),
    ).toEqual(refused);
    expect(await removeDealContact({ dealId, contactId: other.id })).toEqual(
      refused,
    );
    expect(
      await starMainContact({
        dealId,
        side: 'buyer',
        lenderRoomId: null,
        who: { contactId: other.id },
      }),
    ).toEqual(refused);
    expect(
      await attachDealContact({
        dealId,
        contactId: other.id,
        role: 'other',
        side: 'buyer',
      }),
    ).toEqual(refused);

    const { data: untouched } = await admin
      .from('contact')
      .select('name')
      .eq('id', other.id)
      .single()
      .throwOnError();
    expect(untouched.name).toBe('Olive Other');
    expect(await personNamed('Olive Other')).toBeUndefined();
  });
});
