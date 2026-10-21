// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { NeedsYou, upcomingDates } from './needs-you';

function parse(markup: string) {
  return new DOMParser().parseFromString(markup, 'text/html');
}

const nothing = {
  dealId: 'd1',
  reviews: [],
  messages: [],
  roomActivity: [],
  dates: [],
};

describe('NeedsYou', () => {
  it('says nothing needs them when nothing is waiting', () => {
    expect(
      parse(renderToStaticMarkup(<NeedsYou {...nothing} />)).body.textContent,
    ).toContain('Nothing needs you right now');
  });

  it('names who asked for a review and when, and leads to Contracts', () => {
    const page = parse(
      renderToStaticMarkup(
        <NeedsYou
          {...nothing}
          reviews={[
            {
              contract: 'APA',
              version: 2,
              requestedBy: 'Dana Lee',
              requestedAt: '2026-10-03T15:00:00Z',
            },
          ]}
        />,
      ),
    );

    expect(page.body.textContent).toContain(
      'Review requested by Dana Lee on Oct 3, 2026',
    );
    expect(page.body.textContent).not.toContain('Nothing needs you right now');
    expect(
      [...page.querySelectorAll('a')].map((link) => link.getAttribute('href')),
    ).toContain('/counsel/d1/contracts');
  });

  it('shows team messages and seller room activity with links to their pages', () => {
    const page = parse(
      renderToStaticMarkup(
        <NeedsYou
          {...nothing}
          messages={[
            {
              id: 'm1',
              author_name: 'Dana Lee',
              body: 'Can you look at the escrow clause?',
              created_at: '2026-10-04T15:00:00Z',
            },
          ]}
          roomActivity={[
            {
              id: 'f1',
              what: 'New file: Tax returns 2025.pdf',
              at: '2026-10-05T15:00:00Z',
            },
          ]}
        />,
      ),
    );

    expect(page.body.textContent).toContain(
      'Can you look at the escrow clause?',
    );
    expect(page.body.textContent).toContain('New file: Tax returns 2025.pdf');
    expect(
      [...page.querySelectorAll('a')].map((link) => link.getAttribute('href')),
    ).toEqual(
      expect.arrayContaining([
        '/counsel/d1/messages',
        '/counsel/d1/seller-room',
      ]),
    );
  });
});

describe('upcomingDates', () => {
  it('keeps shared dates from today on that have not happened, soonest first', () => {
    expect(
      upcomingDates(
        [
          {
            kind: 'closing',
            label: null,
            target_on: '2026-12-01',
            actual_on: null,
          },
          {
            kind: 'custom',
            label: 'Site visit',
            target_on: '2026-10-19',
            actual_on: null,
          },
          {
            kind: 'loi_signed',
            label: null,
            target_on: '2026-10-25',
            actual_on: '2026-10-18',
          },
          {
            kind: 'apa_signing',
            label: null,
            target_on: '2026-10-18',
            actual_on: null,
          },
          {
            kind: 'diligence_end',
            label: null,
            target_on: null,
            actual_on: null,
          },
        ],
        '2026-10-19',
      ),
    ).toEqual([
      { label: 'Site visit', on: '2026-10-19' },
      { label: 'Closing', on: '2026-12-01' },
    ]);
  });
});
