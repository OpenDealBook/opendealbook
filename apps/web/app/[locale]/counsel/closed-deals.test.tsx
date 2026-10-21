// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ClosedDeals } from './closed-deals';

describe('ClosedDeals', () => {
  it('links each ended deal to the client thread and marks it read-only', () => {
    const page = new DOMParser().parseFromString(
      renderToStaticMarkup(
        <ClosedDeals
          deals={[
            {
              id: 'd1',
              name: 'Brennan Tooling',
              teamName: 'Harbor Holdings',
              readUntil: '2027-10-10T15:00:00+00:00',
            },
          ]}
        />,
      ),
      'text/html',
    );
    const link = page.querySelector('a')!;

    expect(page.querySelector('h2')?.textContent).toBe('Closed deals');
    expect(link.getAttribute('href')).toBe('/counsel/d1/client');
    expect(link.textContent).toContain('Brennan Tooling');
    expect(page.body.textContent).toContain('Read-only until Oct 10, 2027');
    expect(page.body.textContent).toContain('Harbor Holdings');
  });
});
