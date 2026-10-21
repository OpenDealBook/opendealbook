// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({ pathname: '/counsel/d1' }));

vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));

import { CounselNav } from './counsel-nav';

function links(markup: string) {
  return [
    ...new DOMParser()
      .parseFromString(markup, 'text/html')
      .querySelectorAll('a'),
  ].map((link) => [link.textContent, link.getAttribute('href')]);
}

describe('CounselNav', () => {
  it("leads buyer's counsel to the data room and the seller questions too", () => {
    expect(
      links(
        renderToStaticMarkup(<CounselNav dealId={'d1'} sides={['buyer']} />),
      ),
    ).toEqual([
      ['Overview', '/counsel/d1'],
      ['Contracts', '/counsel/d1/contracts'],
      ['Messages', '/counsel/d1/messages'],
      ['Data room', '/counsel/d1/data-room'],
      ['Seller questions', '/counsel/d1/questions'],
    ]);
  });

  it("leads seller's counsel to the seller room and their private client thread too", () => {
    expect(
      links(
        renderToStaticMarkup(<CounselNav dealId={'d1'} sides={['seller']} />),
      ),
    ).toEqual([
      ['Overview', '/counsel/d1'],
      ['Contracts', '/counsel/d1/contracts'],
      ['Messages', '/counsel/d1/messages'],
      ['Seller room', '/counsel/d1/seller-room'],
      ['Your client', '/counsel/d1/client'],
    ]);
  });

  it("leads seller's counsel on an ended deal only to what they can still read", () => {
    expect(
      links(
        renderToStaticMarkup(
          <CounselNav dealId={'d1'} sides={['seller']} readOnly />,
        ),
      ),
    ).toEqual([['Your client', '/counsel/d1/client']]);
  });

  it('marks the tab for the page counsel are on', () => {
    route.pathname = '/counsel/d1/messages';

    const current = new DOMParser()
      .parseFromString(
        renderToStaticMarkup(<CounselNav dealId={'d1'} sides={['buyer']} />),
        'text/html',
      )
      .querySelectorAll('[aria-current="page"]');

    expect([...current].map((link) => link.textContent)).toEqual(['Messages']);
  });
});
