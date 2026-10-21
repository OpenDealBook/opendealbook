// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CounselActivityTable } from './counsel-activity-table';

function rows(markup: string) {
  return [
    ...new DOMParser()
      .parseFromString(markup, 'text/html')
      .querySelectorAll('tbody tr'),
  ].map((row) =>
    [...row.querySelectorAll('td')].slice(0, 3).map((cell) => cell.textContent),
  );
}

describe('CounselActivityTable', () => {
  it('lists who opened which file and how', () => {
    expect(
      rows(
        renderToStaticMarkup(
          <CounselActivityTable
            entries={[
              {
                id: 'a2',
                action: 'document_downloaded',
                person: 'Bea Buyerlaw',
                file: 'returns.pdf',
                at: '2026-10-16T10:00:00Z',
              },
              {
                id: 'a1',
                action: 'document_previewed',
                person: 'Bea Buyerlaw',
                file: 'lease.pdf',
                at: '2026-10-16T09:00:00Z',
              },
            ]}
          />,
        ),
      ),
    ).toEqual([
      ['Bea Buyerlaw', 'Downloaded', 'returns.pdf'],
      ['Bea Buyerlaw', 'Previewed', 'lease.pdf'],
    ]);
  });

  it('says so when counsel have opened nothing', () => {
    expect(
      new DOMParser().parseFromString(
        renderToStaticMarkup(<CounselActivityTable entries={[]} />),
        'text/html',
      ).body.textContent,
    ).toBe("Buyer's counsel have not opened any files yet.");
  });
});
