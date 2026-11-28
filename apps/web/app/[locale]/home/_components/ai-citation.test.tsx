// @vitest-environment jsdom
import { act } from 'react';

import { NextIntlClientProvider } from 'next-intl';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DocumentCitation } from '@odb/ai/citations';
import type { AnswerPart } from '@odb/ai/parts';

import messages from '../../../../messages/en.json';
import { AnswerParts, Figure } from './ai-answer-parts';
import { AiAnswer, AnswerCitations, Citation } from './ai-citation';

vi.mock('next/navigation', () => ({
  useParams: () => ({ account: 'acme' }),
}));

const PAGES: DocumentCitation = {
  documentId: 'doc-cim',
  documentName: 'cim.pdf',
  version: 2,
  fromOcr: false,
  pageFrom: 4,
  pageTo: 5,
};

const ONE_PAGE: DocumentCitation = { ...PAGES, pageFrom: 7, pageTo: 7 };

const CELLS: DocumentCitation = {
  documentId: 'doc-model',
  documentName: 'model.xlsx',
  version: 1,
  fromOcr: false,
  sheet: 'Sheet1',
  cellRange: 'A1:C9',
};

const CARD: AnswerPart = {
  id: 1,
  kind: 'document',
  v: 1,
  documentId: 'doc-cim',
  documentName: 'cim.pdf',
  version: 2,
  page: 4,
  note: 'The customer list.',
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
  parts: AnswerPart[] = [],
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
          parts={parts}
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

  it('quotes the excerpt kept for a citation in its hover preview', async () => {
    const excerpt = 'Revenue grew 12% on renewed service contracts.';
    vi.useFakeTimers();
    render('See [cim.pdf v2, p. 4-5].', [{ ...PAGES, excerpt }], {
      'doc-cim': 2,
    });
    expect(document.body.textContent).not.toContain(excerpt);

    await act(async () => {
      buttons()[0]!.dispatchEvent(
        new MouseEvent('pointerover', { bubbles: true }),
      );
      await vi.runAllTimersAsync();
    });
    vi.useRealTimers();

    expect(document.body.querySelector('blockquote')?.textContent).toBe(
      excerpt,
    );
  });

  it('previews a citation saved without an excerpt with no quote', async () => {
    vi.useFakeTimers();
    render('See [cim.pdf v2, p. 4-5].', [PAGES], { 'doc-cim': 2 });

    await act(async () => {
      buttons()[0]!.dispatchEvent(
        new MouseEvent('pointerover', { bubbles: true }),
      );
      await vi.runAllTimersAsync();
    });
    vi.useRealTimers();

    expect(document.body.textContent).toContain('Pages 4 to 5');
    expect(document.body.querySelector('blockquote')).toBeNull();
  });

  it('marks a citation whose text came from a scan, on its chip and in its preview', async () => {
    vi.useFakeTimers();
    render(
      'Scanned [cim.pdf v2, p. 4-5] and typed [model.xlsx v1, Sheet1!A1:C9].',
      [{ ...PAGES, fromOcr: true }, CELLS],
      { 'doc-cim': 2, 'doc-model': 1 },
    );

    expect(buttons().map((chip) => chip.textContent)).toEqual([
      'cim.pdf v2, p. 4-5, From scan',
      'model.xlsx v1, Sheet1!A1:C9',
    ]);

    await act(async () => {
      buttons()[0]!.dispatchEvent(
        new MouseEvent('pointerover', { bubbles: true }),
      );
      await vi.runAllTimersAsync();
    });
    vi.useRealTimers();

    const preview = document.body.querySelector(
      '[data-slot="hover-card-content"]',
    );
    expect(preview?.textContent).toContain('Pages 4 to 5, From scan');
  });

  it('marks an unavailable citation whose text came from a scan', () => {
    render('Gone [cim.pdf v2, p. 4-5].', [{ ...PAGES, fromOcr: true }], {});

    expect(container.textContent).toBe('Gone cim.pdf, unavailable, From scan.');
  });

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

describe('AiAnswer document cards', () => {
  function cards() {
    return [...container.querySelectorAll('figure')];
  }

  it('places a card where its figure token stands, with the page and note, opening the data room there', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(
      'Customers are listed here.\n[[figure 1]]\nThat is **all**.',
      [],
      { 'doc-cim': 2 },
      [CARD],
    );

    expect(cards().map((card) => card.textContent)).toEqual([
      'cim.pdfPage 4The customer list.Open',
    ]);
    const text = container.textContent!;
    expect(text.indexOf('Customers are listed here.')).toBeLessThan(
      text.indexOf('cim.pdf'),
    );
    expect(text.indexOf('cim.pdf')).toBeLessThan(text.indexOf('That is all.'));
    expect(text).not.toContain('**');

    act(() => button('Open')!.click());

    expect(open.mock.calls.map(([url]) => url)).toEqual([
      '/deal-windows/acme/deal-1/data-room/view?doc=doc-cim&page=4',
    ]);
  });

  it('opens a workbook card at its sheet', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render('[[figure 2]]', [], { 'doc-model': 1 }, [
      {
        id: 2,
        kind: 'document',
        v: 1,
        documentId: 'doc-model',
        documentName: 'model.xlsx',
        version: 1,
        sheet: 'P&L',
      },
    ]);

    expect(cards().map((card) => card.textContent)).toEqual([
      'model.xlsxSheet P&LOpen',
    ]);
    act(() => button('Open')!.click());

    expect(open.mock.calls.map(([url]) => url)).toEqual([
      '/deal-windows/acme/deal-1/data-room/view?doc=doc-model&sheet=P%26L',
    ]);
  });

  it('drops a figure token with no card', () => {
    render('See [[figure 2]] here.', [], { 'doc-cim': 2 }, [CARD]);

    expect(container.textContent).not.toContain('figure');
    expect(container.textContent!.startsWith('See')).toBe(true);
    expect(container.textContent).toContain('here.');
  });

  it('appends a card the answer never placed after the text', () => {
    render('No token here.', [], { 'doc-cim': 2 }, [CARD]);

    expect(cards()).toHaveLength(1);
    expect(container.textContent!.replaceAll('\n', '')).toBe(
      'No token here.cim.pdfPage 4The customer list.Open',
    );
  });

  it('shows a card for a document the viewer cannot read as not available, without a link', () => {
    render('[[figure 1]]', [], {}, [CARD]);

    expect(buttons()).toEqual([]);
    expect(cards().map((card) => card.textContent)).toEqual([
      'cim.pdfPage 4The customer list.Not available',
    ]);
  });

  it('keeps the link of a card whose document gained a newer version and says so', () => {
    render('[[figure 1]]', [], { 'doc-cim': 3 }, [CARD]);

    expect(cards().map((card) => card.textContent)).toEqual([
      'cim.pdfPage 4Newer version availableThe customer list.Open',
    ]);
  });

  it('says nothing of versions on a card for the current version', () => {
    render('[[figure 1]]', [], { 'doc-cim': 2 }, [CARD]);

    expect(container.textContent).not.toContain('Newer version');
  });

  it('shows a figure tag the model wrote itself as text, not as a card', () => {
    render('Trust me <figure index="0"></figure>.', [], { 'doc-cim': 2 }, [
      CARD,
    ]);

    expect(
      container.textContent!.startsWith(
        'Trust me <figure index="0"></figure>.',
      ),
    ).toBe(true);
  });

  it('shows a figure tag that inline code fails to hide across a blank line as text, without a card', () => {
    render(
      'a `b\n\n<figure index="7"></figure>\n\nc` d',
      [],
      { 'doc-cim': 2 },
      [],
    );

    expect(cards()).toEqual([]);
    expect(container.textContent).toContain('<figure index="7"></figure>');
  });

  it('adds no card for a figure tag hidden in broken inline code, even one naming a real card', () => {
    render(
      'a `b\n\n<figure index="0"></figure>\n\nc` d',
      [],
      { 'doc-cim': 2 },
      [CARD],
    );

    expect(cards()).toHaveLength(1);
    expect(container.textContent).toContain('<figure index="0"></figure>');
  });

  it.each(['3', 'x'])(
    'renders nothing for a figure tag whose index %s has no card',
    (index) => {
      act(() =>
        root.render(
          <NextIntlClientProvider locale={'en'} messages={messages}>
            <AnswerCitations
              value={{ dealId: 'deal-1', citations: [], readable: {} }}
            >
              <AnswerParts value={[CARD]}>
                {'Before '}
                <Figure index={index} />
                {' after'}
              </AnswerParts>
            </AnswerCitations>
          </NextIntlClientProvider>,
        ),
      );

      expect(container.textContent).toBe('Before  after');
    },
  );

  it('shows a card once, where it is first placed', () => {
    render('x [[figure 1]] y [[figure 1]] z', [], { 'doc-cim': 2 }, [CARD]);

    expect(cards()).toHaveLength(1);
    expect(container.textContent).not.toContain('figure');
    const text = container.textContent!;
    expect(text.indexOf('x')).toBeLessThan(text.indexOf('cim.pdf'));
    expect(text.indexOf('cim.pdf')).toBeLessThan(text.indexOf('y'));
  });

  it.each([
    [
      'a table row',
      '| Year | Note |\n| --- | --- |\n| 2025 | see [[figure 1]] |\n| 2026 | none |\n\nAfter.',
      'table',
      'td',
      ['2025', 'see', '2026', 'none'],
    ],
    [
      'a list item',
      '- one [[figure 1]]\n- two\n\nAfter.',
      'ul',
      'li',
      ['one', 'two'],
    ],
    [
      'a blockquote',
      '> quoted [[figure 1]]\n> more\n\nAfter.',
      'blockquote',
      'blockquote',
      ['quoted more'],
    ],
  ])(
    'moves a marker inside %s to just after that block',
    (_, text, block, item, items) => {
      render(text, [], { 'doc-cim': 2 }, [CARD]);

      expect(
        [...container.querySelectorAll(item)].map((found) =>
          found.textContent!.replaceAll(/\s+/g, ' ').trim(),
        ),
      ).toEqual(items);
      expect(container.querySelectorAll(block)).toHaveLength(1);

      expect(cards()).toHaveLength(1);
      expect(cards()[0]!.closest(block)).toBeNull();
      expect(container.querySelector(block)).not.toBeNull();
      const shown = container.textContent!;
      expect(shown).not.toContain('figure');
      expect(shown.indexOf('cim.pdf')).toBeLessThan(shown.indexOf('After.'));
      expect(container.querySelector(block)!.textContent).not.toContain(
        'cim.pdf',
      );
    },
  );

  it('moves a marker in a loose list continuation to just after the list', () => {
    render(
      '- one\n\n  more [[figure 1]]\n\n- two\n\nAfter.',
      [],
      { 'doc-cim': 2 },
      [CARD],
    );

    expect(container.querySelectorAll('ul')).toHaveLength(1);
    expect(cards()).toHaveLength(1);
    expect(cards()[0]!.closest('ul')).toBeNull();
    const shown = container.textContent!;
    expect(shown).not.toContain('figure');
    expect(shown.indexOf('two')).toBeLessThan(shown.indexOf('cim.pdf'));
    expect(shown.indexOf('cim.pdf')).toBeLessThan(shown.indexOf('After.'));
  });

  it('leaves a marker inside a code fence nested four or more spaces in a list as written and appends its card', () => {
    render(
      '- item\n\n      ```\n      [[figure 1]]\n      ```\n- next\n\nAfter.',
      [],
      { 'doc-cim': 2 },
      [CARD],
    );

    expect(cards()).toHaveLength(1);
    const shown = container.textContent!;
    expect(shown).toContain('[[figure 1]]');
    expect(shown.indexOf('After.')).toBeLessThan(shown.indexOf('cim.pdf'));
  });

  it('leaves a marker in inline code inside a list item as written and appends its card', () => {
    render('- see `[[figure 1]]` here\n- two\n\nAfter.', [], { 'doc-cim': 2 }, [
      CARD,
    ]);

    expect(cards()).toHaveLength(1);
    expect(container.querySelector('li code')?.textContent).toBe(
      '[[figure 1]]',
    );
    const shown = container.textContent!;
    expect(shown.indexOf('After.')).toBeLessThan(shown.indexOf('cim.pdf'));
  });

  it('places a marker in a list that follows an unmatched backtick', () => {
    render(
      'Note ` here:\n- one [[figure 1]]\n- two `code`\n\nAfter.',
      [],
      { 'doc-cim': 2 },
      [CARD],
    );

    expect(cards()).toHaveLength(1);
    expect(cards()[0]!.closest('ul')).toBeNull();
    const shown = container.textContent!;
    expect(shown).not.toContain('figure');
    expect(shown.indexOf('two')).toBeLessThan(shown.indexOf('cim.pdf'));
    expect(shown.indexOf('cim.pdf')).toBeLessThan(shown.indexOf('After.'));
  });

  it('leaves a marker inside a tilde fence indented four spaces in a list item as written and appends its card', () => {
    render(
      '-   item\n\n    ~~~\n    [[figure 1]]\n    ~~~\n-   next\n\nAfter.',
      [],
      { 'doc-cim': 2 },
      [CARD],
    );

    expect(cards()).toHaveLength(1);
    const shown = container.textContent!;
    expect(shown).toContain('[[figure 1]]');
    expect(shown.indexOf('After.')).toBeLessThan(shown.indexOf('cim.pdf'));
  });

  it('leaves a marker in inline code in a list after an unmatched backtick as written', () => {
    render(
      'Note ` here:\n- see `[[figure 1]]`\n\nAfter.',
      [],
      { 'doc-cim': 2 },
      [CARD],
    );

    expect(container.querySelector('li code')?.textContent).toBe(
      '[[figure 1]]',
    );
    expect(cards()).toHaveLength(1);
  });

  it.each([
    ['a list item', '- [[figure 1]]\n- two\n\nAfter.', 'li', ['two']],
    ['a blockquote', '> [[figure 1]]\n\nAfter.', 'blockquote', []],
  ])(
    'removes %s that held only the marker it lifted',
    (_, text, item, items) => {
      render(text, [], { 'doc-cim': 2 }, [CARD]);

      expect(cards()).toHaveLength(1);
      expect(
        [...container.querySelectorAll(item)].map((found) =>
          found.textContent!.trim(),
        ),
      ).toEqual(items);
    },
  );

  it('keeps a table cell emptied by a lifted marker so the cells after it stay in their columns', () => {
    render(
      '| a | b |\n| --- | --- |\n| [[figure 1]] | x |\n\nAfter.',
      [],
      { 'doc-cim': 2 },
      [CARD],
    );

    expect(cards()).toHaveLength(1);
    expect(
      [...container.querySelectorAll('td')].map((cell) => cell.textContent),
    ).toEqual(['', 'x']);
  });

  it('removes a link whose text was only the marker', () => {
    render(
      'See [[[figure 1]]](https://example.com) now.',
      [],
      { 'doc-cim': 2 },
      [CARD],
    );

    expect(cards()).toHaveLength(1);
    expect(buttons().map((found) => found.textContent)).toEqual(['Open']);
    expect(container.querySelector('a')).toBeNull();
  });

  it('adds no card for a raw figure tag that slips past the code escaping after a heading', () => {
    render('# a `b\n<figure index="0"></figure>`', [], { 'doc-cim': 2 }, [
      CARD,
    ]);

    expect(cards()).toHaveLength(1);
  });
});
