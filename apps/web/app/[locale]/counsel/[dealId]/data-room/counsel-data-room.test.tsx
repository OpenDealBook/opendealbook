// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CounselDataRoom } from './counsel-data-room';

function parse(markup: string) {
  return new DOMParser().parseFromString(markup, 'text/html');
}

function document(id: string, name: string, version: number) {
  return {
    id,
    name,
    type: 'PDF',
    version,
    storagePath: `deal/${id}`,
    uploadedAt: null,
  };
}

describe('CounselDataRoom', () => {
  it('lists every folder by its path with the files in it', () => {
    const page = parse(
      renderToStaticMarkup(
        <CounselDataRoom
          dealId={'deal1'}
          groups={[
            {
              folderId: 'f1',
              name: 'Financials',
              path: 'Financials',
              documents: [],
            },
            {
              folderId: 'f2',
              name: 'Tax',
              path: 'Financials / Tax',
              documents: [
                document('d2', 'returns.pdf', 2),
                document('d1', 'returns.pdf', 1),
              ],
            },
          ]}
        />,
      ),
    );

    expect(
      [...page.querySelectorAll('h2')].map((heading) => heading.textContent),
    ).toEqual(['Financials', 'Financials / Tax']);
    expect(
      [...page.querySelectorAll('li')].map((item) => item.textContent),
    ).toEqual(['returns.pdf (version 2)', 'returns.pdf (version 1)']);
    expect(
      [...page.querySelectorAll('li a')].map((link) =>
        link.getAttribute('href'),
      ),
    ).toEqual([
      '/counsel/deal1/data-room/files/d2?disposition=download',
      '/counsel/deal1/data-room/files/d1?disposition=download',
    ]);
    expect(page.body.textContent).toContain('No files');
  });

  it('says what comes next when the data room is empty', () => {
    expect(
      parse(
        renderToStaticMarkup(<CounselDataRoom dealId={'deal1'} groups={[]} />),
      ).body.textContent,
    ).toContain("The deal team hasn't shared anything here yet.");
  });
});
