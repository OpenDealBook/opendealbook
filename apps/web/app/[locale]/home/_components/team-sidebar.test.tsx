// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TeamSidebar } from './team-sidebar';

const TEAM = {
  id: 't-1',
  name: 'Brennan Acquisition Partners of Greater Tampa Bay',
  slug: 'brennan',
};

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <TeamSidebar
        team={TEAM}
        teams={[TEAM]}
        groups={[
          {
            heading: 'Work',
            links: [{ label: 'Deals', path: '/home/brennan/deals' }],
          },
        ]}
      />,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('TeamSidebar', () => {
  it('offers a skip link to the main content before any other control', () => {
    const first = container.querySelector('a[href], button');

    expect(first?.textContent).toBe('Skip to content');
    expect(first?.getAttribute('href')).toBe('#main-content');
  });

  it('exposes the full team name on the truncated switcher', () => {
    const switcher = container.querySelector(
      `button[aria-label="${TEAM.name}, switch team"]`,
    );

    expect(switcher?.getAttribute('title')).toBe(TEAM.name);
  });
});
