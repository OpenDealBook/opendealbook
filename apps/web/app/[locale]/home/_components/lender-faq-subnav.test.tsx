// @vitest-environment jsdom
import { createElement } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LenderFaqSubnav } from './lender-faq-subnav';
import { clearScreen, fakeServer, linkTo, show } from './lender-test-kit';

vi.mock(
  'next/navigation',
  async () => (await import('./lender-test-kit')).navigation,
);

const BASE =
  '/home/team-one/deals/1b0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11/lenders';

function current() {
  return document.querySelector('a[aria-current="page"]')?.textContent;
}

beforeEach(() => fakeServer.reset());

afterEach(clearScreen);

describe('the Rooms and FAQ tabs of a deal Lenders area', () => {
  it('links to the rooms and the FAQ and marks Rooms on the overview', () => {
    fakeServer.pathname = BASE;
    show(createElement(LenderFaqSubnav, { basePath: BASE }));

    expect(linkTo('Rooms')).toBe(BASE);
    expect(linkTo('FAQ')).toBe(`${BASE}/faq`);
    expect(current()).toBe('Rooms');
  });

  it('marks FAQ on the FAQ page', () => {
    fakeServer.pathname = `${BASE}/faq`;
    show(createElement(LenderFaqSubnav, { basePath: BASE }));

    expect(current()).toBe('FAQ');
  });
});
