// @vitest-environment jsdom
import { createElement } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LenderRoomRow } from './lender-room-list';
import { LenderRoomsOverview } from './lender-rooms-overview';
import {
  alerts,
  attach,
  button,
  buttonNames,
  clearScreen,
  field,
  fields,
  linkTo,
  pageText,
  press,
  fakeServer,
  settle,
  show,
  type,
} from './lender-test-kit';

vi.mock(
  'next/navigation',
  async () => (await import('./lender-test-kit')).navigation,
);
vi.mock('@odb/lender-rooms/rooms/actions.ts', async () =>
  (await import('./lender-test-kit')).fakeActions('createLenderRoom'),
);
vi.mock('@odb/lender-rooms/brand/actions.ts', async () =>
  (await import('./lender-test-kit')).fakeActions(
    'lookupLenderBrand',
    'setManualLenderLogo',
  ),
);

const DEAL = '1b0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';
const BASE = `/home/team-one/deals/${DEAL}/lenders`;

const firstBank: LenderRoomRow = {
  id: 'room-1',
  name: 'First Bank',
  initials: 'FB',
  logoUrl: 'https://logos.test/first-bank.png',
  status: 'term_sheet',
  access: { kind: 'open', expiresAt: '2027-01-05T23:59:59.999Z' },
  peopleCount: 3,
  waitingOnUs: 2,
  lastActivityAt: '2026-10-12T10:00:00.000Z',
};

const harbor: LenderRoomRow = {
  id: 'room-2',
  name: 'Harbor Credit Union',
  initials: 'HC',
  logoUrl: null,
  status: 'selected',
  access: { kind: 'closed' },
  peopleCount: 1,
  waitingOnUs: 0,
  lastActivityAt: null,
};

function showOverview(rows: LenderRoomRow[]) {
  show(
    createElement(LenderRoomsOverview, { dealId: DEAL, basePath: BASE, rows }),
  );
}

beforeEach(() => {
  fakeServer.reset();
});

afterEach(clearScreen);

describe('the lender rooms overview', () => {
  it('shows one row per room with what the team needs to scan', () => {
    showOverview([
      firstBank,
      harbor,
      {
        ...harbor,
        id: 'room-3',
        name: 'Lapsed Lender',
        status: 'reviewing',
        access: { kind: 'expired', expiredAt: '2026-09-01T23:59:59.999Z' },
      },
      {
        ...harbor,
        id: 'room-4',
        name: 'Chosen Lender',
        access: { kind: 'open', expiresAt: null },
      },
    ]);

    const [first, second, third, fourth] = [
      ...document.querySelectorAll('li'),
    ].map((row) => (row.textContent ?? '').replace(/\s+/g, ' '));

    expect(linkTo('First Bank')).toBe(`${BASE}/room-1`);
    expect(first).toContain('Term sheet');
    expect(first).toMatch(/Open.*Expires Jan 5, 2027/);
    expect(first).toContain('3 people');
    expect(first).toContain('2 requests waiting on us');
    expect(first).toContain('Last lender activity');
    expect(document.querySelector('img')?.getAttribute('src')).toBe(
      'https://logos.test/first-bank.png',
    );

    expect(second).toContain('HC');
    expect(second).toContain('Selected');
    expect(second).toContain('Closed');
    expect(second).not.toContain('Expire');
    expect(second).toContain('1 person');
    expect(second).toContain('No requests waiting on us');
    expect(second).toContain('No lender activity yet');

    expect(third).toContain('Expired on Sep 1, 2026');
    expect(third).not.toContain('Expires');
    expect(third).not.toContain('Open');

    expect(fourth).toMatch(/Open.*No expiry/);
  });

  it('invites the team to create the first room when there are none', () => {
    showOverview([]);

    expect(pageText()).toContain('No lender rooms yet');
    expect(buttonNames()).toContain('Create the first lender room');
  });
});

describe('creating a lender room', () => {
  it('fills the name from the website and creates the room under that brand', async () => {
    fakeServer.values.lookupLenderBrand = {
      domain: 'firstbank.com',
      name: 'First Bank',
      logoPath: 'firstbank.com/logo',
      logoUrl: 'https://logos.test/found.png',
    };
    fakeServer.values.createLenderRoom = 'room-9';
    showOverview([harbor]);

    await press('Create lender room');
    await type("Lender's website", 'https://www.firstbank.com');
    await press('Look up');

    expect(fakeServer.inputsTo('lookupLenderBrand')).toEqual([
      { dealId: DEAL, url: 'https://www.firstbank.com' },
    ]);
    expect(field('Lender name').value).toBe('First Bank');
    expect(fields('Logo')).toEqual([]);
    expect(
      document.querySelector('[role="dialog"] img')?.getAttribute('src'),
    ).toBe('https://logos.test/found.png');

    await press('Create room');

    expect(fakeServer.inputsTo('createLenderRoom')).toEqual([
      {
        dealId: DEAL,
        name: 'First Bank',
        brandDomain: 'firstbank.com',
      },
    ]);
    expect(fakeServer.inputsTo('setManualLenderLogo')).toEqual([]);
    expect(fakeServer.pathname).toBe(`${BASE}/room-9?tab=people`);
  });

  it('asks for the name and offers a logo upload when the website gives nothing', async () => {
    fakeServer.values.lookupLenderBrand = null;
    fakeServer.values.createLenderRoom = 'room-9';
    showOverview([harbor]);

    await press('Create lender room');
    await type("Lender's website", 'tinylender.example');
    await press('Look up');

    expect(pageText()).toContain(
      'We could not read a name or logo from that website',
    );
    expect(field('Lender name').value).toBe('');

    await type('Lender name', 'Tiny Lender');
    await attach('Logo', 'tiny.png');
    await press('Create room');
    await settle();

    expect(fakeServer.inputsTo('createLenderRoom')).toEqual([
      { dealId: DEAL, name: 'Tiny Lender', brandDomain: 'tinylender.example' },
    ]);
    expect(fakeServer.inputsTo('setManualLenderLogo')).toMatchObject([
      { dealId: DEAL, roomId: 'room-9' },
    ]);
    expect(
      (fakeServer.inputsTo('setManualLenderLogo')[0] as { file: File }).file
        .name,
    ).toBe('tiny.png');
  });

  it('does not create a second room when only the logo was refused and the team tries again', async () => {
    fakeServer.values.lookupLenderBrand = null;
    fakeServer.values.createLenderRoom = 'room-9';
    fakeServer.refusalFor.setManualLenderLogo =
      'The logo must be an image of at most 512 KiB';
    showOverview([harbor]);

    await press('Create lender room');
    await type("Lender's website", 'tinylender.example');
    await press('Look up');
    await type('Lender name', 'Tiny Lender');
    await attach('Logo', 'huge.png');
    await press('Create room');
    await settle();

    expect(alerts()).toEqual(['The logo must be an image of at most 512 KiB']);

    await press('Create room');
    await settle();

    expect(fakeServer.inputsTo('createLenderRoom')).toHaveLength(1);
    expect(fakeServer.inputsTo('setManualLenderLogo')).toHaveLength(2);
  });

  it('creates a room from a typed name alone, with no lookup and no logo upload', async () => {
    fakeServer.values.createLenderRoom = 'room-9';
    showOverview([harbor]);

    await press('Create lender room');

    expect(fields('Logo')).toEqual([]);

    await type('Lender name', 'Plain Lender');
    await press('Create room');

    expect(fakeServer.inputsTo('lookupLenderBrand')).toEqual([]);
    expect(fakeServer.inputsTo('createLenderRoom')).toEqual([
      { dealId: DEAL, name: 'Plain Lender' },
    ]);
    expect(fakeServer.pathname).toBe(`${BASE}/room-9?tab=people`);
  });

  it('holds creation while a typed website has not been looked up', async () => {
    showOverview([harbor]);

    await press('Create lender room');
    await type('Lender name', 'First Bank');
    await type("Lender's website", 'firstbank.com');

    expect(button('Create room').disabled).toBe(true);
    expect(pageText()).toContain('Look the website up first, or clear it');
  });

  it('shows the refusal as given when the room cannot be created', async () => {
    fakeServer.values.lookupLenderBrand = null;
    showOverview([harbor]);

    await press('Create lender room');
    await type("Lender's website", 'tinylender.example');
    await press('Look up');
    await type('Lender name', 'Tiny Lender');
    fakeServer.refusal = 'Only the deal team can do that';
    await press('Create room');

    expect(alerts()).toEqual(['Only the deal team can do that']);
  });
});
