// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buttons,
  clearScreen,
  press,
  settle,
  show,
} from '@odb/lender-rooms/requests-ui/test-support/screen.ts';

const server = vi.hoisted(() => ({ fetchDealActivity: vi.fn() }));

vi.mock('@odb/deals/shared', () => server);
vi.mock('@odb/supabase/client', () => ({
  getSupabaseBrowserClient: () => 'browser-client',
}));

import { DealActivitySection } from './deal-activity-section';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(clearScreen);

const ana = {
  id: 'e2',
  who: 'Ana Analyst',
  what: 'added checklist item "Tax returns"',
  at: '2026-10-19T14:05:00Z',
};
const morgan = {
  id: 'e1',
  who: 'Morgan Reyes',
  what: 'created the deal in Sourcing',
  at: '2026-10-18T09:00:00Z',
};

function feed() {
  return [...document.querySelectorAll('li')].map((item) => ({
    text: item.querySelector('p')?.textContent,
    when: item.querySelector('time')?.getAttribute('datetime'),
  }));
}

describe('DealActivitySection', () => {
  it('lists who did what and when, in the order given', () => {
    show(
      <DealActivitySection
        dealId={'deal-1'}
        accountId={'team-1'}
        first={{ entries: [ana, morgan], more: false }}
      />,
    );

    expect(feed()).toEqual([
      {
        text: 'Ana Analyst added checklist item "Tax returns"',
        when: '2026-10-19T14:05:00Z',
      },
      {
        text: 'Morgan Reyes created the deal in Sourcing',
        when: '2026-10-18T09:00:00Z',
      },
    ]);
    expect(buttons('Show more')).toEqual([]);
  });

  it('loads the next fifty below when Show more is pressed', async () => {
    server.fetchDealActivity.mockResolvedValueOnce({
      entries: [morgan],
      more: false,
    });
    show(
      <DealActivitySection
        dealId={'deal-1'}
        accountId={'team-1'}
        first={{ entries: [ana], more: true }}
      />,
    );

    await press('Show more');
    await settle();

    expect(server.fetchDealActivity).toHaveBeenCalledWith(
      'browser-client',
      'deal-1',
      'team-1',
      1,
    );
    expect(feed().map(({ text }) => text)).toEqual([
      'Ana Analyst added checklist item "Tax returns"',
      'Morgan Reyes created the deal in Sourcing',
    ]);
    expect(buttons('Show more')).toEqual([]);
  });
});
