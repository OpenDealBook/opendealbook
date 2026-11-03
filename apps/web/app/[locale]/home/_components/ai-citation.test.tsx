// @vitest-environment jsdom
import { act } from 'react';

import { NextIntlClientProvider } from 'next-intl';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DocumentCitation } from '@odb/ai/citations';

import messages from '../../../../messages/en.json';
import { AiAnswer, AnswerCitations, Citation } from './ai-citation';

vi.mock('next/navigation', () => ({
  useParams: () => ({ account: 'acme' }),
}));

const PAGES: DocumentCitation = {
  documentId: 'doc-cim',
  documentName: 'cim.pdf',
  version: 2,
  pageFrom: 4,
  pageTo: 5,
};

const ONE_PAGE: DocumentCitation = { ...PAGES, pageFrom: 7, pageTo: 7 };

const CELLS: DocumentCitation = {
  documentId: 'doc-model',
  documentName: 'model.xlsx',
  version: 1,
  sheet: 'Sheet1',
  cellRange: 'A1:C9',
};

const LINKS = {
  openExternalLink: 'Leave for an outside site?',
  externalLinkWarning: 'This link goes outside OpenDealBook.',
  openLink: 'Go to the site',
  copyLink: 'Copy the address',
  copied: 'Address copied',
  close: 'Stay here',
};

let container: HTMLDivElement;
let root: Root;

function render(
  text: string,
  citations: DocumentCitation[],
  readable: Record<string, number>,
) {
  act(() =>
    root.render(
      <NextIntlClientProvider
        locale={'en'}
        messages={{
          ...messages,
          dealAsk: { ...messages.dealAsk, links: LINKS },
        }}
      >
        <AiAnswer
          dealId={'deal-1'}
          text={text}
          citations={citations}
          readable={readable}
        />
      </NextIntlClientProvider>,
    ),
  );
}

function buttons() {
  return [...container.querySelectorAll('button')];
}

function button(name: string, within: Element = container) {
  return [...within.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === name,
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('AiAnswer', () => {
  it('turns bracketed labels into citations worded by page or sheet range', () => {
    render(
      'Revenue grew [cim.pdf v2, p. 4-5], churn is low [cim.pdf v2, p. 7] and margins hold [model.xlsx v1, Sheet1!A1:C9].',
      [PAGES, ONE_PAGE, CELLS],
      { 'doc-cim': 2, 'doc-model': 1 },
    );

    expect(buttons().map((button) => button.textContent)).toEqual([
      'cim.pdf v2, p. 4-5',
      'cim.pdf v2, p. 7',
      'model.xlsx v1, Sheet1!A1:C9',
    ]);
    expect(container.textContent).toBe(
      'Revenue grew cim.pdf v2, p. 4-5, churn is low cim.pdf v2, p. 7 and margins hold model.xlsx v1, Sheet1!A1:C9.',
    );
  });

  it('opens the cited document at its first page or at its sheet', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(
      'See [cim.pdf v2, p. 4-5] and [model.xlsx v1, Sheet1!A1:C9].',
      [PAGES, CELLS],
      { 'doc-cim': 2, 'doc-model': 1 },
    );

    act(() => buttons()[0]!.click());
    act(() => buttons()[1]!.click());

    expect(open.mock.calls.map(([url]) => url)).toEqual([
      '/deal-windows/acme/deal-1/data-room/view?doc=doc-cim&page=4',
      '/deal-windows/acme/deal-1/data-room/view?doc=doc-model&sheet=Sheet1',
    ]);
  });

  it('shows a citation the viewer can no longer read as unavailable, without a link', () => {
    render(
      'Removed [model.xlsx v1, Sheet1!A1:C9], replaced [cim.pdf v2, p. 4-5].',
      [CELLS, PAGES],
      { 'doc-cim': 3 },
    );

    expect(buttons()).toEqual([]);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toBe(
      'Removed model.xlsx, unavailable, replaced cim.pdf, unavailable.',
    );
  });

  it('leaves a bracketed label with no matching citation as written', () => {
    render('Odd [other.pdf v1, p. 2].', [PAGES], { 'doc-cim': 2 });

    expect(buttons()).toEqual([]);
    expect(container.textContent).toBe('Odd [other.pdf v1, p. 2].');
  });

  it('renders the answer as markdown with bold, lists and tables', () => {
    render(
      'Revenue is **$2M**.\n\n- Growth is strong\n- Churn is low\n\n| Year | Revenue |\n| --- | --- |\n| 2025 | $2M |',
      [],
      {},
    );

    expect(container.textContent).not.toContain('*');
    expect(
      [...container.querySelectorAll('*')].some(
        (element) => element.textContent === '$2M',
      ),
    ).toBe(true);
    expect(
      [...container.querySelectorAll('li')].map((item) => item.textContent),
    ).toEqual(['Growth is strong', 'Churn is low']);
    expect(
      [...container.querySelectorAll('td')].map((cell) => cell.textContent),
    ).toEqual(['2025', '$2M']);
  });

  it('turns a label inside a markdown list into a citation that opens the document', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render('Key points:\n\n- **Revenue** grew [cim.pdf v2, p. 4-5]', [PAGES], {
      'doc-cim': 2,
    });

    const item = container.querySelector('li')!;
    expect(item.textContent).toBe('Revenue grew cim.pdf v2, p. 4-5');
    act(() => item.querySelector('button')!.click());

    expect(open.mock.calls.map(([url]) => url)).toEqual([
      '/deal-windows/acme/deal-1/data-room/view?doc=doc-cim&page=4',
    ]);
  });

  it.each([
    [PAGES, '[cim.pdf v2, p. 4-5]', ['cim.pdf', 'Version 2', 'Pages 4 to 5']],
    [ONE_PAGE, '[cim.pdf v2, p. 7]', ['cim.pdf', 'Version 2', 'Page 7']],
    [
      CELLS,
      '[model.xlsx v1, Sheet1!A1:C9]',
      ['model.xlsx', 'Version 1', 'Sheet1, cells A1:C9'],
    ],
  ])(
    'previews the cited document on hover as %#',
    async (citation, label, preview) => {
      vi.useFakeTimers();
      render(`See ${label}.`, [citation], {
        [citation.documentId]: citation.version,
      });
      for (const line of preview.slice(1)) {
        expect(document.body.textContent).not.toContain(line);
      }

      await act(async () => {
        buttons()[0]!.dispatchEvent(
          new MouseEvent('pointerover', { bubbles: true }),
        );
        await vi.runAllTimersAsync();
      });
      vi.useRealTimers();

      for (const line of preview) {
        expect(document.body.textContent).toContain(line);
      }
    },
  );

  it('shows a citation tag the model wrote itself as text, not as a badge', () => {
    render('Trust me <citation index="0"></citation>.', [PAGES], {
      'doc-cim': 2,
    });

    expect(buttons()).toEqual([]);
    expect(container.textContent).toBe(
      'Trust me <citation index="0"></citation>.',
    );
  });

  it('renders nothing for a citation tag whose index has no citation', () => {
    act(() =>
      root.render(
        <NextIntlClientProvider locale={'en'} messages={messages}>
          <AnswerCitations
            value={{
              dealId: 'deal-1',
              citations: [PAGES],
              readable: { 'doc-cim': 2 },
            }}
          >
            {'Before '}
            <Citation index={'3'} />
            {' after'}
          </AnswerCitations>
        </NextIntlClientProvider>,
      ),
    );

    expect(container.textContent).toBe('Before  after');
  });

  it('never loads an image or runs a script written in the answer', () => {
    render(
      'Chart ![chart](https://evil.example/chart.png) and <img src="https://evil.example/pixel.png"> then <script>window.hacked = true</script>',
      [],
      {},
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).not.toContain('chart.png');
  });

  it('opens a link in a new tab without a referrer after a translated confirmation', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render('See [the filing](https://example.com/filing).', [], {});

    act(() => button('the filing')!.click());

    expect(document.body.textContent).toContain(LINKS.openExternalLink);
    expect(document.body.textContent).toContain(LINKS.externalLinkWarning);
    expect(button(LINKS.copyLink, document.body)).toBeDefined();
    expect(
      document.body.querySelector(`button[title="${LINKS.close}"]`),
    ).not.toBeNull();

    act(() => button(LINKS.openLink, document.body)!.click());

    expect(open.mock.calls).toEqual([
      ['https://example.com/filing', '_blank', 'noreferrer'],
    ]);
  });

  it('leaves labels inside inline code and link text as written', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(
      'Code `[cim.pdf v2, p. 4-5]` and link [cim.pdf v2, p. 4-5](https://example.com).',
      [PAGES],
      { 'doc-cim': 2 },
    );

    expect(container.textContent).toBe(
      'Code [cim.pdf v2, p. 4-5] and link cim.pdf v2, p. 4-5.',
    );
    act(() => button('cim.pdf v2, p. 4-5')!.click());
    expect(open).not.toHaveBeenCalled();
  });

  it('shows angle brackets in prose and code as written', () => {
    render('Debt < $2M and `x<y`.', [], {});

    expect(container.textContent).toBe('Debt < $2M and x<y.');
  });
});
