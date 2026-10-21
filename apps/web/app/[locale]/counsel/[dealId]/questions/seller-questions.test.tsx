// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SellerQuestions } from './seller-questions';

function parse(markup: string) {
  return new DOMParser().parseFromString(markup, 'text/html');
}

describe('SellerQuestions', () => {
  it('shows each question with its status and the thread under it', () => {
    const document = parse(
      renderToStaticMarkup(
        <SellerQuestions
          dealId={'deal1'}
          questions={[
            {
              id: 'q1',
              title: 'Customer list?',
              body: 'Top ten by revenue',
              status: 'answered',
              messages: [
                { side: 'internal', body: 'Revenue for 2025 please' },
                { side: 'seller', body: 'Attached the list' },
              ],
              files: [{ documentId: 'doc1', name: 'customers.xlsx' }],
            },
          ]}
        />,
      ),
    );

    expect(document.querySelector('h3')?.textContent).toBe('Customer list?');
    expect(document.body.textContent).toContain('Top ten by revenue');
    expect(document.body.textContent).toContain('Answered');
    expect(
      [...document.querySelectorAll('li')].map((item) => item.textContent),
    ).toEqual([
      'Deal team: Revenue for 2025 please',
      'Seller: Attached the list',
      'customers.xlsx',
    ]);
    expect(document.querySelector('li a')?.getAttribute('href')).toBe(
      '/counsel/deal1/data-room/files/doc1?disposition=download',
    );
  });

  it('offers no way to answer', () => {
    const document = parse(
      renderToStaticMarkup(
        <SellerQuestions
          dealId={'deal1'}
          questions={[
            {
              id: 'q1',
              title: 'Customer list?',
              body: null,
              status: 'open',
              messages: [],
              files: [],
            },
          ]}
        />,
      ),
    );

    expect(document.querySelector('textarea, button, form')).toBeNull();
  });

  it('says where questions will show when the seller has not been asked anything', () => {
    expect(
      renderToStaticMarkup(<SellerQuestions dealId={'deal1'} questions={[]} />),
    ).toContain("Questions the deal team asks the seller show here.");
  });
});
