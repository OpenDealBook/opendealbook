// @vitest-environment jsdom
import { act } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ItemFocus } from './item-focus';
import { clearScreen, pageText, show } from './lender-test-kit';

vi.mock('next/navigation', () => ({
  usePathname: () => '/home/team-one/deals/deal-1/diligence',
}));

let scrolledTo: string[];

beforeEach(() => {
  vi.useFakeTimers();
  scrolledTo = [];
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolledTo.push(this.id);
  };
});

afterEach(() => {
  clearScreen();
  window.location.hash = '';
  vi.useRealTimers();
});

function openAt(hash: string) {
  window.location.hash = hash;
  show(
    <>
      <ItemFocus />
      <ul>
        <li id={'checklist-item-c-1'}>Tax returns</li>
        <li id={'checklist-item-c-2'}>Leases</li>
      </ul>
      <section id={'seller-room'}>Seller room</section>
      <ul>
        <li id={'contract-comment-r-1'}>
          <details>
            <summary>Resolved: Owen</summary>
            <p>Tighten the indemnity cap</p>
          </details>
        </li>
      </ul>
      <details>
        <summary>Resolved</summary>
        <details>
          <summary>Thread</summary>
          <p id={'contract-comment-k-1'}>Fixed</p>
        </details>
      </details>
    </>,
  );
}

const item = (id: string) => document.getElementById(id)!;

describe('ItemFocus', () => {
  it('scrolls to the linked item and highlights it briefly', () => {
    openAt('#checklist-item-c-2');

    expect(scrolledTo).toEqual(['checklist-item-c-2']);
    expect(item('checklist-item-c-2').classList).toContain('bg-accent');
    expect(item('checklist-item-c-1').classList).not.toContain('bg-accent');

    act(() => vi.advanceTimersByTime(3000));

    expect(item('checklist-item-c-2').classList).not.toContain('bg-accent');
  });

  it('opens the collapsed sections that hide the linked item', () => {
    openAt('#contract-comment-k-1');

    expect(
      [...document.querySelectorAll('details')].map((each) => each.open),
    ).toEqual([false, true, true]);
    expect(scrolledTo).toEqual(['contract-comment-k-1']);
  });

  it('opens a collapsed section the linked item wraps', () => {
    openAt('#contract-comment-r-1');

    expect(item('contract-comment-r-1').querySelector('details')?.open).toBe(
      true,
    );
    expect(scrolledTo).toEqual(['contract-comment-r-1']);
  });

  it('says the item is no longer available when the page does not show it', () => {
    openAt('#checklist-item-gone');

    expect(pageText()).toContain('That item is no longer available.');
  });

  it('leaves a section anchor alone', () => {
    openAt('#seller-room');

    expect(pageText()).not.toContain('That item is no longer available.');
    expect(item('seller-room').classList).not.toContain('bg-accent');
  });
});
