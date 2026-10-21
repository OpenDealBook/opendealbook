// @vitest-environment jsdom
import { act, createElement } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DealSubnav } from './deal-subnav';
import {
  button,
  clearScreen,
  fakeServer,
  linkTo,
  show,
} from './lender-test-kit';

vi.mock('next/navigation', async () => {
  const { fakeServer } = await import('./lender-test-kit');

  return {
    usePathname: () => fakeServer.pathname,
    useRouter: () => ({
      replace: (href: string) => {
        fakeServer.pathname = href;
      },
    }),
  };
});

const DEAL = '/home/team-one/deals/deal-1';

function at(path: string) {
  fakeServer.pathname = `${DEAL}${path}`;
}

function current(): string[] {
  return [...document.querySelectorAll('[aria-current]')].map(
    (element) => element.textContent ?? '',
  );
}

async function openPostClose() {
  await act(async () => {
    button('Post-close').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
  });
}

function menuLinks() {
  return [...document.querySelectorAll('[role="menuitem"]')].map((item) => [
    item.textContent,
    item.getAttribute('href'),
  ]);
}

beforeEach(() => fakeServer.reset());

afterEach(() => {
  clearScreen();
  window.location.hash = '';
});

describe('the deal tabs', () => {
  it('group the deal by job: Overview, Diligence, Parties, Documents, Financials', () => {
    at('');
    show(createElement(DealSubnav, { showLenders: true }));

    expect(linkTo('Overview')).toBe(DEAL);
    expect(linkTo('Diligence')).toBe(`${DEAL}/diligence`);
    expect(linkTo('Parties')).toBe(`${DEAL}/parties`);
    expect(linkTo('Documents')).toBe(`${DEAL}/documents`);
    expect(linkTo('Financials')).toBe(`${DEAL}/financials`);
    expect(current()).toEqual(['Overview']);
  });

  it('keep the old to-dos, schedule and meetings pages under Diligence, with seller Q&A pointing at the seller room', () => {
    at('/todos');
    show(createElement(DealSubnav));

    expect(current()).toEqual(['Diligence', 'To-dos']);
    expect(linkTo('Checklist')).toBe(`${DEAL}/diligence`);
    expect(linkTo('Schedule')).toBe(`${DEAL}/schedule`);
    expect(linkTo('Meetings')).toBe(`${DEAL}/meetings`);
    expect(linkTo('Seller Q&A')).toBe(`${DEAL}/parties#seller-room`);
  });

  it('keep worksheets and workbooks under Financials', () => {
    at('/workbooks');
    show(createElement(DealSubnav));

    expect(current()).toEqual(['Financials', 'Workbooks']);
    expect(linkTo('Worksheets')).toBe(`${DEAL}/worksheets`);
  });

  it('keep a lender room under Parties when the deal has lenders', () => {
    at('/lenders/room-1');
    show(createElement(DealSubnav, { showLenders: true }));

    expect(current()).toEqual(['Parties', 'Lenders']);
  });

  it('hide Lenders when the deal has none', () => {
    at('/parties');
    show(createElement(DealSubnav));

    expect(linkTo('Lenders')).toBeUndefined();
  });
});

describe('the Post-close menu', () => {
  it('is always there, collapsed, holding Operating, HR audit and Customer transition', async () => {
    at('');
    show(createElement(DealSubnav));

    expect(linkTo('Operating')).toBeUndefined();

    await openPostClose();

    expect(menuLinks()).toEqual([
      ['Operating', `${DEAL}/operating`],
      ['HR audit', `${DEAL}/hr-audit`],
      ['Customer transition', `${DEAL}/customer-transition`],
    ]);
  });

  it('is highlighted once an offer is accepted', () => {
    at('');
    show(createElement(DealSubnav, { offerAccepted: true }));

    const trigger = [...document.querySelectorAll('button')].find((each) =>
      each.textContent?.startsWith('Post-close'),
    );

    expect(trigger?.textContent).toBe('Post-closeOffer accepted');
  });

  it('is not highlighted before an offer is accepted', () => {
    at('');
    show(createElement(DealSubnav));

    expect(document.body.textContent).not.toContain('Offer accepted');
  });

  it('is marked current on a post-close page', () => {
    at('/hr-audit');
    show(createElement(DealSubnav));

    expect(current()).toEqual(['Post-close']);
  });
});

describe('an old Overview anchor', () => {
  it('sends #seller-room to the seller room on the Parties tab', () => {
    at('');
    window.location.hash = '#seller-room';
    show(createElement(DealSubnav));

    expect(fakeServer.pathname).toBe(`${DEAL}/parties#seller-room`);
  });
});
