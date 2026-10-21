// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DataRoomWindow, type WindowFolder } from './data-room-window';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const VIEWER_FIXTURES = join(
  import.meta.dirname,
  '../../../../../../packages/features/lender-rooms/src/viewer/fixtures',
);
const PDF_WORKER = join(
  import.meta.dirname,
  '../../../../../../packages/features/lender-rooms/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
);
const VIEW = '/deal-windows/acme/deal-1/data-room/view';
const FILES = '/deal-windows/acme/deal-1/data-room/files';

const FOLDERS: WindowFolder[] = [
  {
    id: 'f-fin',
    name: 'Financials',
    files: [
      { id: 'doc-pdf', name: 'Tax return 2024.pdf', version: 1 },
      { id: 'doc-xlsx', name: 'P&L.xlsx', version: 2 },
      { id: 'doc-term', name: 'Term sheet.pdf', version: 1 },
    ],
    folders: [
      {
        id: 'f-bank',
        name: 'Bank statements',
        files: [{ id: 'doc-png', name: 'March.png', version: 1 }],
        folders: [],
      },
    ],
  },
  {
    id: 'f-leg',
    name: 'Legal',
    files: [
      { id: 'doc-docx', name: 'Lease.docx', version: 1 },
      { id: 'doc-zip', name: 'Permits.zip', version: 1 },
    ],
    folders: [],
  },
];

const PREVIEW_BYTES: Record<string, string> = {
  'doc-pdf': 'locked.pdf',
  'doc-term': 'sample.pdf',
  'doc-xlsx': 'sample.xlsx',
  'doc-docx': 'hostile.docx',
};

let container: HTMLDivElement;
let root: Root;
let fetched: string[];

beforeEach(() => {
  fetched = [];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', async (url: string) => {
    fetched.push(url);
    const documentId = url.slice(FILES.length + 1).split('?')[0]!;
    const bytes = readFileSync(
      join(VIEWER_FIXTURES, PREVIEW_BYTES[documentId]!),
    );

    return {
      ok: true,
      redirected: false,
      url: 'https://storage.example/object',
      headers: new Headers(),
      arrayBuffer: async () => Uint8Array.from(bytes).buffer,
    };
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function open(
  selectedId: string | null,
  initialPage?: number,
  initialSheet?: string,
) {
  await act(async () => {
    root.render(
      <DataRoomWindow
        dealName={'Brennan Tooling'}
        dealHref={'/home/acme/deals/deal-1'}
        viewHref={VIEW}
        filesHref={FILES}
        folders={FOLDERS}
        selectedId={selectedId}
        initialPage={initialPage}
        initialSheet={initialSheet}
      />,
    );
  });
}

function fileLink(name: string) {
  return [...container.querySelectorAll('a')].find((anchor) =>
    anchor.textContent?.includes(name),
  );
}

async function shows(text: string) {
  await vi.waitFor(() => expect(container.textContent).toContain(text));
}

describe('DataRoomWindow', () => {
  it('links back to the deal by its name', async () => {
    await open(null);

    expect(fileLink('Brennan Tooling')?.getAttribute('href')).toBe(
      '/home/acme/deals/deal-1',
    );
  });

  it('lists each file under its folder, sub-folders included', async () => {
    await open(null);

    const folderOf = (name: string) =>
      fileLink(name)?.closest('details')?.querySelector('summary')?.textContent;

    expect(folderOf('Tax return 2024.pdf')).toBe('Financials');
    expect(folderOf('March.png')).toBe('Bank statements');
    expect(folderOf('Lease.docx')).toBe('Legal');
  });

  it('gives each file its full name as a tooltip for when the tree cuts it short', async () => {
    await open(null);

    expect(fileLink('Tax return 2024.pdf')?.getAttribute('title')).toBe(
      'Tax return 2024.pdf',
    );
  });

  it('collapses a folder to hide its files', async () => {
    await open(null);
    const legal = [...container.querySelectorAll('details')].find(
      (details) => details.querySelector('summary')?.textContent === 'Legal',
    )!;

    await act(async () => legal.querySelector('summary')!.click());

    expect(legal.open).toBe(false);
  });

  it('puts the chosen file in the window address', async () => {
    await open(null);

    expect(fileLink('Lease.docx')?.getAttribute('href')).toBe(
      `${VIEW}?doc=doc-docx`,
    );
  });

  it('asks for a file when none is chosen', async () => {
    await open(null);

    expect(container.textContent).toContain('Choose a file to view it here');
    expect(fetched).toEqual([]);
  });

  it('shows the file named in the address and marks it as current', async () => {
    await open('doc-xlsx');

    await shows('Revenue');
    expect(fetched).toEqual([`${FILES}/doc-xlsx?disposition=preview`]);
    expect(fileLink('P&L.xlsx')?.getAttribute('aria-current')).toBe('page');
    expect(fileLink('Lease.docx')?.hasAttribute('aria-current')).toBe(false);
  });

  it('renders an Excel file as sheet tabs', async () => {
    await open('doc-xlsx');

    await shows('Revenue');
    expect(
      [...container.querySelectorAll('[role="tab"]')].map(
        (tab) => tab.textContent,
      ),
    ).toEqual(['Summary', 'Rent roll']);
  });

  it('opens a spreadsheet on the sheet named in the address', async () => {
    await open('doc-xlsx', undefined, 'Rent roll');

    await vi.waitFor(() =>
      expect(
        container.querySelector('[role="tab"][aria-selected="true"]')
          ?.textContent,
      ).toBe('Rent roll'),
    );
  });

  it('renders a Word file in the page', async () => {
    await open('doc-docx');

    const frame = await vi.waitFor(() => {
      const element = container.querySelector('iframe');
      expect(element).not.toBeNull();
      return element!;
    });
    expect(frame.getAttribute('srcdoc')).toContain('Covenant summary');
  });

  it('opens a PDF in the PDF viewer', async () => {
    vi.stubGlobal('pdfjsWorker', await import(/* @vite-ignore */ PDF_WORKER));

    await open('doc-pdf');

    await shows('This PDF is password protected');
  });

  it('opens a PDF on the page named in the address', async () => {
    vi.stubGlobal('pdfjsWorker', await import(/* @vite-ignore */ PDF_WORKER));
    const drawingContext: unknown = new Proxy(function () {}, {
      get: (_, key) =>
        key === 'then'
          ? undefined
          : ['a', 'd', 'width', 'height'].includes(String(key))
            ? 1
            : ['b', 'c', 'e', 'f'].includes(String(key))
              ? 0
              : drawingContext,
      apply: () => drawingContext,
      set: () => true,
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => drawingContext as never,
    );
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly notify: () => void) {}
        observe() {
          this.notify();
        }
        disconnect() {}
      },
    );

    await open('doc-term', 2);

    await shows('Page 2 of 2');
  });

  it('says a file named in the address is no longer available and opens the tree', async () => {
    await open('doc-gone');

    expect(container.querySelector('[role=alert]')?.textContent).toBe(
      'That file is no longer available.',
    );
    expect(
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent === 'Files')
        ?.getAttribute('aria-expanded'),
    ).toBe('true');
    expect(fetched).toEqual([]);
  });

  it('shows an image from its preview address', async () => {
    await open('doc-png');

    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      `${FILES}/doc-png?disposition=preview`,
    );
  });

  it('offers a download for a file it cannot show', async () => {
    await open('doc-zip');

    expect(container.textContent).toContain(
      'Preview is not available for this file type',
    );
    expect(fileLink('Download')?.getAttribute('href')).toBe(
      `${FILES}/doc-zip?disposition=download`,
    );
  });
});
