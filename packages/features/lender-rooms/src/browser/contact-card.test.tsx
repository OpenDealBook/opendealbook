// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContactCard } from './contact-card';

describe('ContactCard', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  function lines() {
    return [...container.querySelectorAll('address span, address a')]
      .filter((node) => node.children.length === 0)
      .map((node) => node.textContent);
  }

  it('shows the name and phone of the contact on the deal team, then their email', () => {
    act(() =>
      root.render(
        <ContactCard
          contact={{
            name: 'Dana Whitfield',
            photoUrl: null,
            email: 'dana@dockside.test',
            phone: '555 0142',
          }}
        />,
      ),
    );

    expect(lines()).toEqual([
      'D',
      'Your contact on this deal',
      'Dana Whitfield',
      '555 0142',
      'dana@dockside.test',
    ]);
    expect(
      container.querySelector('a[href="mailto:dana@dockside.test"]'),
    ).not.toBeNull();
  });

  it('shows the email alone under the same heading when there is no name', () => {
    act(() =>
      root.render(
        <ContactCard
          contact={{
            name: null,
            photoUrl: null,
            email: 'owner@dockside.test',
            phone: null,
          }}
        />,
      ),
    );

    expect(lines()).toEqual([
      'Your contact on this deal',
      'owner@dockside.test',
    ]);
  });
});
