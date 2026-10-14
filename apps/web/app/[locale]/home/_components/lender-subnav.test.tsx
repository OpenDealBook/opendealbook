// @vitest-environment jsdom
import { createElement } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DealSubnav } from './deal-subnav';
import { clearScreen, fakeServer, linkTo, show } from './lender-test-kit';

vi.mock(
  'next/navigation',
  async () => (await import('./lender-test-kit')).navigation,
);

const BASE =
  '/home/team-one/deals/1b0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11/lenders';

beforeEach(() => fakeServer.reset());

afterEach(clearScreen);

describe('the Lenders tab', () => {
  it('links to the lenders page and stays marked on a room inside it', () => {
    fakeServer.pathname = `${BASE}/room-1`;
    show(createElement(DealSubnav, { showLenders: true }));

    expect(linkTo('Lenders')).toBe(BASE);
    expect(document.querySelector('a[aria-current="page"]')?.textContent).toBe(
      'Lenders',
    );
  });

  it('is not shown unless the deal team flag is passed, as on a personal deal', () => {
    fakeServer.pathname = BASE;
    show(createElement(DealSubnav));

    expect(linkTo('Lenders')).toBeUndefined();
    expect(linkTo('Todos')).toBe(BASE.replace('/lenders', '/todos'));
  });
});
