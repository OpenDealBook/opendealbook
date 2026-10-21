// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'en', account: 'acme', id: 'deal-1' }),
}));

import {
  DataRoomDocumentLink,
  OpenDataRoomWindow,
  openDataRoomWindow,
} from './data-room-document-link';

let container: HTMLDivElement;
let root: Root;
const opened: { url: string; target: string; features: string }[] = [];

beforeEach(() => {
  opened.length = 0;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('open', (url: string, target: string, features: string) => {
    opened.push({ url, target, features });
    return null;
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function click(text: string) {
  await act(async () => {
    [...container.querySelectorAll('button')]
      .find((button) => button.textContent === text)!
      .click();
  });
}

describe('DataRoomDocumentLink', () => {
  it('opens the document in a separate data room window for the deal', async () => {
    await act(async () => {
      root.render(
        <DataRoomDocumentLink dealId={'deal-1'} documentId={'doc-1'} />,
      );
    });

    await click('Open');

    expect(opened).toEqual([
      {
        url: '/deal-windows/acme/deal-1/data-room/view?doc=doc-1',
        target: 'data-room-deal-1',
        features: 'popup',
      },
    ]);
  });

  it('reuses the same window when another document is opened', async () => {
    await act(async () => {
      root.render(
        <>
          <DataRoomDocumentLink dealId={'deal-1'} documentId={'doc-1'} />
          <DataRoomDocumentLink dealId={'deal-1'} documentId={'doc-2'} />
        </>,
      );
    });

    for (const button of container.querySelectorAll('button')) {
      await act(async () => button.click());
    }

    expect(opened.map((open) => open.target)).toEqual([
      'data-room-deal-1',
      'data-room-deal-1',
    ]);
    expect(opened[1]!.url).toBe(
      '/deal-windows/acme/deal-1/data-room/view?doc=doc-2',
    );
  });
});

describe('OpenDataRoomWindow', () => {
  it('opens the deal data room window with no file chosen, under the same window name', async () => {
    await act(async () => {
      root.render(<OpenDataRoomWindow />);
    });

    await click('Open in data room window');

    expect(opened).toEqual([
      {
        url: '/deal-windows/acme/deal-1/data-room/view',
        target: 'data-room-deal-1',
        features: 'popup',
      },
    ]);
  });
});

describe('openDataRoomWindow', () => {
  it('opens a cited page and sheet of a document in the deal data room window', () => {
    openDataRoomWindow({
      account: 'acme',
      dealId: 'deal-1',
      doc: 'doc-1',
      page: 3,
      sheet: 'P&L 2024',
    });

    expect(opened).toHaveLength(1);
    const url = new URL(opened[0]!.url, 'http://odb.test');
    expect(url.pathname).toBe('/deal-windows/acme/deal-1/data-room/view');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      doc: 'doc-1',
      page: '3',
      sheet: 'P&L 2024',
    });
    expect(opened[0]!.target).toBe('data-room-deal-1');
    expect(opened[0]!.features).toBe('popup');
  });

  it('leaves out the page and sheet when none is cited', () => {
    openDataRoomWindow({
      account: 'acme',
      dealId: 'deal-1',
      doc: 'doc-1',
      page: undefined,
      sheet: undefined,
    });

    expect(opened[0]!.url).toBe(
      '/deal-windows/acme/deal-1/data-room/view?doc=doc-1',
    );
  });
});
