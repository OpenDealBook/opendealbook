// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DealRoster } from '@odb/deal-people/queries.ts';

const server = vi.hoisted(() => ({
  add: vi.fn(),
  attach: vi.fn(),
  edit: vi.fn(),
  remove: vi.fn(),
  star: vi.fn(),
  unstar: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@odb/deal-people/actions.ts', () => ({
  addDealContact: server.add,
  attachDealContact: server.attach,
  editDealContact: server.edit,
  removeDealContact: server.remove,
  starMainContact: server.star,
  unstarMainContact: server.unstar,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
}));

import { DealPeopleSection } from './deal-people-section';

const DONE = { ok: true, value: undefined };

const bea = {
  user_id: null,
  email: 'bea@brokers.test',
  name: 'Bea Broker',
  entries: [
    {
      source: 'contact',
      contact_id: 'c-1',
      name: 'Bea Broker',
      phone: '555-0101',
      company: 'Main Street Brokers',
      side: 'seller',
      role: 'broker',
      lender_room_id: null,
      room_closed: null,
      is_main: false,
    },
  ],
} satisfies DealRoster['people'][number];

const people: DealRoster['people'] = [
  {
    user_id: 'u-1',
    email: 'ada@partners.test',
    name: 'Ada Owner',
    entries: [
      {
        source: 'team',
        user_id: 'u-1',
        contact_id: null,
        name: 'Ada Owner',
        phone: null,
        company: 'People Partners',
        side: 'buyer',
        role: 'owner',
        lender_room_id: null,
        room_closed: null,
        is_main: true,
      },
    ],
  },
  {
    user_id: 'u-2',
    email: 'lou@northwind.test',
    name: 'Lou Lender',
    entries: [
      {
        source: 'lender_room',
        user_id: 'u-2',
        contact_id: null,
        name: 'Lou Lender',
        phone: null,
        company: 'Northwind Bank',
        side: 'lender',
        role: 'lender',
        lender_room_id: 'r-1',
        room_closed: true,
        is_main: false,
      },
    ],
  },
  bea,
];

function teamMember(
  userId: string,
  name: string,
  role: string,
): DealRoster['people'][number] {
  return {
    user_id: userId,
    email: `${userId}@partners.test`,
    name,
    entries: [
      {
        source: 'team',
        user_id: userId,
        contact_id: null,
        name,
        phone: null,
        company: 'People Partners',
        side: 'buyer',
        role,
        lender_room_id: null,
        room_closed: null,
        is_main: false,
      },
    ],
  };
}

const addressBook: DealRoster['addressBook'] = [
  {
    id: 'c-9',
    name: 'Dee Dealer',
    email: 'dee@dealers.test',
    company: 'Dealers Inc',
  },
  { id: 'c-8', name: 'Ed Escrow', email: null, company: null },
];

let container: HTMLDivElement;
let root: Root;

function render(canEdit: boolean) {
  act(() =>
    root.render(
      <DealPeopleSection
        dealId={'deal-1'}
        roster={{ people, canEdit, addressBook }}
      />,
    ),
  );
}

function row(name: string) {
  return [...container.querySelectorAll('li')].find((item) =>
    item.textContent?.startsWith(name),
  )!;
}

function button(label: string) {
  return container.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
}

async function click(label: string) {
  await act(async () => {
    button(label)!.click();
  });
}

function fill(label: string, value: string) {
  const field = container.querySelector<HTMLInputElement | HTMLSelectElement>(
    `[aria-label="${label}"]`,
  )!;
  const prototype =
    field instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')!.set!;

  act(() => {
    setter.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  for (const mock of Object.values(server)) {
    mock.mockReset();
  }
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('DealPeopleSection', () => {
  it('lists each person with role, side, company and phone', () => {
    render(false);

    expect(row('Ada Owner').textContent).toContain('ada@partners.test');
    expect(row('Ada Owner').textContent).toContain('Owner');
    expect(row('Ada Owner').textContent).toContain('Buyer');
    expect(row('Ada Owner').textContent).toContain('People Partners');
    expect(row('Ada Owner').textContent).not.toContain('phone');
    expect(row('Bea Broker').textContent).toContain('Broker');
    expect(row('Bea Broker').textContent).toContain('Seller');
    expect(row('Bea Broker').textContent).toContain('Main Street Brokers');
    expect(row('Bea Broker').textContent).toContain('555-0101');
  });

  it('names each team member by their role on the team', () => {
    act(() =>
      root.render(
        <DealPeopleSection
          dealId={'deal-1'}
          roster={{
            canEdit: false,
            addressBook,
            people: [
              teamMember('u-3', 'Priya Shah', 'analyst'),
              teamMember('u-4', 'Tom Team', 'member'),
              teamMember('u-5', 'Cora Counsel', 'counsel'),
              teamMember('u-6', 'Vic Viewer', 'viewer'),
            ],
          }}
        />,
      ),
    );

    expect(row('Priya Shah').textContent).toContain('Team member');
    expect(row('Priya Shah').textContent).not.toContain('Principal');
    expect(row('Tom Team').textContent).toContain('Team member');
    expect(row('Cora Counsel').textContent).toContain('In-house counsel');
    expect(row('Vic Viewer').textContent).toContain('Read only');
  });

  it('shows the invite name when the account name is only the email handle', () => {
    act(() =>
      root.render(
        <DealPeopleSection
          dealId={'deal-1'}
          roster={{
            canEdit: false,
            addressBook,
            people: [
              {
                user_id: 'u-4',
                email: 'dana.whitfield@dockside.test',
                name: 'dana.whitfield',
                entries: [
                  {
                    source: 'seller_room',
                    user_id: 'u-4',
                    contact_id: null,
                    name: 'Dana Whitfield',
                    phone: null,
                    company: null,
                    side: 'seller',
                    role: 'seller',
                    lender_room_id: null,
                    room_closed: false,
                    is_main: false,
                  },
                ],
              },
            ],
          }}
        />,
      ),
    );

    expect(container.querySelector('li span')!.textContent).toBe(
      'Dana Whitfield',
    );
    expect(container.querySelector('li')!.textContent).toContain(
      'dana.whitfield@dockside.test',
    );
  });

  it('marks main contacts and closed rooms', () => {
    render(false);

    expect(row('Ada Owner').textContent).toContain('Main contact');
    expect(row('Lou Lender').textContent).not.toContain('Main contact');
    expect(row('Lou Lender').textContent).toContain('Room closed');
    expect(row('Ada Owner').textContent).not.toContain('Room closed');
  });

  it('shows no edit controls to someone who cannot manage the deal', () => {
    render(false);

    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelector('[aria-label="Contact name"]')).toBeNull();
  });

  it("stars a lender as their room's main contact", async () => {
    server.star.mockResolvedValueOnce(DONE);
    render(true);

    await click('Make Lou Lender a main contact');

    expect(server.star).toHaveBeenCalledWith({
      dealId: 'deal-1',
      side: 'lender',
      lenderRoomId: 'r-1',
      who: { userId: 'u-2' },
    });
    expect(server.refresh).toHaveBeenCalled();
  });

  it('stars a hand-added contact by contact', async () => {
    server.star.mockResolvedValueOnce(DONE);
    render(true);

    await click('Make Bea Broker a main contact');

    expect(server.star).toHaveBeenCalledWith({
      dealId: 'deal-1',
      side: 'seller',
      lenderRoomId: null,
      who: { contactId: 'c-1' },
    });
  });

  it('offers no star to a hand-added lender, who belongs to no room', () => {
    act(() =>
      root.render(
        <DealPeopleSection
          dealId={'deal-1'}
          roster={{
            canEdit: true,
            addressBook,
            people: [
              {
                ...bea,
                entries: bea.entries.map((entry) => ({
                  ...entry,
                  side: 'lender' as const,
                })),
              },
            ],
          }}
        />,
      ),
    );

    expect(button('Make Bea Broker a main contact')).toBeNull();
    expect(button('Edit Bea Broker')).not.toBeNull();
  });

  it('clears a main contact', async () => {
    server.unstar.mockResolvedValueOnce(DONE);
    render(true);

    await click('Clear Ada Owner as main contact');

    expect(server.unstar).toHaveBeenCalledWith({
      dealId: 'deal-1',
      side: 'buyer',
      lenderRoomId: null,
    });
  });

  it('edits and removes only hand-added contacts', () => {
    render(true);

    expect(button('Edit Bea Broker')).not.toBeNull();
    expect(button('Remove Bea Broker')).not.toBeNull();
    expect(button('Edit Ada Owner')).toBeNull();
    expect(button('Remove Lou Lender')).toBeNull();
  });

  it('finds an address book contact by name and attaches it', async () => {
    server.attach.mockResolvedValueOnce(DONE);
    render(true);

    fill('Contact name', 'dee');
    fill('Contact role', 'principal');
    fill('Contact side', 'seller');

    expect(button('Use Ed Escrow')).toBeNull();
    expect(container.textContent).toContain('Dealers Inc');
    await click('Use Dee Dealer');

    expect(server.attach).toHaveBeenCalledWith({
      dealId: 'deal-1',
      contactId: 'c-9',
      role: 'principal',
      side: 'seller',
    });
    expect(server.add).not.toHaveBeenCalled();
    expect(server.refresh).toHaveBeenCalled();
  });

  it('finds an address book contact by email', () => {
    render(true);

    fill('Contact name', 'DEALERS.test');

    expect(button('Use Dee Dealer')).not.toBeNull();
  });

  it('shows the email for an address book contact that has no name', () => {
    act(() =>
      root.render(
        <DealPeopleSection
          dealId={'deal-1'}
          roster={{
            people,
            canEdit: true,
            addressBook: [{ id: 'c-7', name: null, email: 'owner@harbor.test', company: null }],
          }}
        />,
      ),
    );

    fill('Contact name', 'harbor');

    const match = button('Use owner@harbor.test')!.closest('li')!;
    expect(match.querySelector('.font-medium')!.textContent).toBe('owner@harbor.test');
  });

  it('offers no address book matches before anything is typed', () => {
    render(true);

    expect(button('Use Dee Dealer')).toBeNull();
  });

  it('adds a contact', async () => {
    server.add.mockResolvedValueOnce(DONE);
    render(true);

    fill('Contact name', 'Cal Counts');
    fill('Contact role', 'cpa');
    fill('Contact side', 'seller');
    fill('Contact company', 'Counts LLP');
    fill('Contact phone', '555-0199');
    fill('Contact email', 'cal@counts.test');
    await click('Add contact');

    expect(server.add).toHaveBeenCalledWith({
      dealId: 'deal-1',
      name: 'Cal Counts',
      role: 'cpa',
      side: 'seller',
      company: 'Counts LLP',
      phone: '555-0199',
      email: 'cal@counts.test',
    });
    expect(server.refresh).toHaveBeenCalled();
  });

  it('edits a contact starting from its current details', async () => {
    server.edit.mockResolvedValueOnce(DONE);
    render(true);

    await click('Edit Bea Broker');
    fill('Contact phone', '555-0202');
    await click('Save contact');

    expect(server.edit).toHaveBeenCalledWith({
      dealId: 'deal-1',
      contactId: 'c-1',
      name: 'Bea Broker',
      role: 'broker',
      side: 'seller',
      company: 'Main Street Brokers',
      phone: '555-0202',
      email: 'bea@brokers.test',
    });
  });

  it('removes a contact', async () => {
    server.remove.mockResolvedValueOnce(DONE);
    render(true);

    await click('Remove Bea Broker');

    expect(server.remove).toHaveBeenCalledWith({
      dealId: 'deal-1',
      contactId: 'c-1',
    });
  });

  it('shows a refusal', async () => {
    server.add.mockResolvedValueOnce({
      ok: false,
      refusal: 'Give the contact a name.',
    });
    render(true);

    await click('Add contact');

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Give the contact a name.',
    );
  });
});
