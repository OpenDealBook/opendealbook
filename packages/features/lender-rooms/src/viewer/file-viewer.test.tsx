import { act, StrictMode } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FileViewer } from './file-viewer';
import { parsePreview } from './parse-preview';

// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('./parse-preview', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./parse-preview')>();
  return { ...actual, parsePreview: vi.fn(actual.parsePreview) };
});

const UNSUPPORTED_MESSAGE = 'Preview is not available for this file type';
const NOT_LOADED_MESSAGE =
  'This file could not be loaded. Reload the page and try again.';
const TOO_LARGE_MESSAGE = 'This file is too large to preview';
const PASSWORD_MESSAGE =
  'This PDF is password protected. Download it to open it.';
const PDF_WORKER = 'pdfjs-dist/legacy/build/pdf.worker.mjs';
const MEBIBYTE = 1024 * 1024;

function fixture(name: string): ArrayBuffer {
  return Uint8Array.from(
    readFileSync(join(import.meta.dirname, 'fixtures', name)),
  ).buffer;
}

function encoded(text: string): ArrayBuffer {
  return Uint8Array.from(new TextEncoder().encode(text)).buffer;
}

describe('FileViewer', () => {
  let container: HTMLDivElement;
  let root: Root;
  let bodyWasRead: boolean;

  function servePreview(
    bytes: ArrayBuffer,
    response: {
      ok?: boolean;
      redirected?: boolean;
      url?: string;
      contentLength?: number;
    } = {},
  ) {
    vi.stubGlobal('fetch', async () => ({
      ok: response.ok ?? true,
      redirected: response.redirected ?? false,
      url: response.url ?? 'https://storage.example/object',
      headers: new Headers(
        response.contentLength === undefined
          ? {}
          : { 'content-length': String(response.contentLength) },
      ),
      arrayBuffer: async () => {
        bodyWasRead = true;
        return bytes;
      },
    }));
  }

  beforeEach(() => {
    bodyWasRead = false;
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.mocked(parsePreview).mockReset();
    vi.doUnmock('mammoth');
  });

  async function open(
    fileName: string,
    initialPage?: number,
    initialSheet?: string,
  ) {
    await act(async () => {
      root.render(
        <FileViewer
          fileName={fileName}
          previewUrl="/preview"
          downloadUrl="/download"
          initialPage={initialPage}
          initialSheet={initialSheet}
        />,
      );
    });
  }

  async function shows(text: string) {
    await vi.waitFor(() => expect(container.textContent).toContain(text));
  }

  function definition(term: string) {
    const label = [...container.querySelectorAll('dt')].find(
      (element) => element.textContent === term,
    );
    return label?.nextElementSibling?.textContent;
  }

  it('offers the download', async () => {
    await open('archive.zip');

    const download = container.querySelector('a[href="/download"]');
    expect(download?.textContent).toBe('Download');
  });

  it('says a preview is not available for an unsupported type', async () => {
    await open('archive.zip');

    expect(container.textContent).toContain(UNSUPPORTED_MESSAGE);
  });

  describe('images', () => {
    it('shows an image through an img element', async () => {
      await open('site.png');

      const image = container.querySelector('img');
      expect(image?.getAttribute('src')).toBe('/preview');
      expect(image?.getAttribute('alt')).toBe('site.png');
    });

    it('shows an SVG through an img element and nothing that could run it', async () => {
      await open('logo.svg');

      expect(container.querySelector('[src="/preview"]')?.tagName).toBe('IMG');
      expect(
        container.querySelector('script, iframe, object, embed, [onload]'),
      ).toBeNull();
    });

    it('never fetches an SVG to read its markup', async () => {
      servePreview(
        encoded('<svg onload="alert(1)"><script>alert(2)</script></svg>'),
      );
      const fetched = vi.spyOn(globalThis, 'fetch');

      await open('logo.svg');

      expect(fetched).not.toHaveBeenCalled();
    });

    it('falls back to the unsupported panel when an image cannot be decoded', async () => {
      await open('site.png');

      act(() => {
        container.querySelector('img')!.dispatchEvent(new Event('error'));
      });

      expect(container.textContent).toContain(UNSUPPORTED_MESSAGE);
      expect(container.querySelector('img')).toBeNull();
    });
  });

  describe('loading', () => {
    it('requests the preview once under strict mode', async () => {
      servePreview(fixture('hostile.md'));
      const fetched = vi.spyOn(globalThis, 'fetch');

      await act(async () => {
        root.render(
          <StrictMode>
            <FileViewer
              fileName="notes.md"
              previewUrl="/preview"
              downloadUrl="/download"
            />
          </StrictMode>,
        );
      });

      await shows('# Diligence notes');
      expect(fetched).toHaveBeenCalledTimes(1);
    });

    it('requests the preview once when it is mounted, unmounted, and mounted again at once', async () => {
      servePreview(fixture('hostile.md'));
      const fetched = vi.spyOn(globalThis, 'fetch');
      const viewer = (
        <FileViewer
          fileName="notes.md"
          previewUrl="/preview"
          downloadUrl="/download"
        />
      );

      act(() => {
        root.render(viewer);
      });
      act(() => {
        root.unmount();
        root = createRoot(container);
        root.render(viewer);
      });

      await shows('# Diligence notes');
      expect(fetched).toHaveBeenCalledTimes(1);
    });

    it('requests the preview again when the file is reopened later', async () => {
      servePreview(fixture('hostile.md'));
      const fetched = vi.spyOn(globalThis, 'fetch');

      await open('notes.md');
      await shows('# Diligence notes');
      await act(async () => {
        root.unmount();
      });
      root = createRoot(container);
      await open('notes.md');

      await shows('# Diligence notes');
      expect(fetched).toHaveBeenCalledTimes(2);
    });

    it('falls back to the unsupported panel when a file cannot be parsed', async () => {
      servePreview(fixture('hostile.docx').slice(0, 300));

      await open('Commitment letter.docx');

      await shows(UNSUPPORTED_MESSAGE);
    });

    it('says the file could not be loaded when the preview cannot be fetched', async () => {
      vi.stubGlobal('fetch', async () => {
        throw new TypeError('Failed to fetch');
      });

      await open('Commitment letter.docx');

      await shows(NOT_LOADED_MESSAGE);
    });

    it('says the file could not be loaded when the server refuses it', async () => {
      servePreview(fixture('hostile.docx'), { ok: false });

      await open('Commitment letter.docx');

      await shows(NOT_LOADED_MESSAGE);
      expect(bodyWasRead).toBe(false);
    });

    it('says the file could not be loaded when the request was redirected to a page on our own origin', async () => {
      servePreview(fixture('hostile.docx'), {
        redirected: true,
        url: `${window.location.origin}/auth/sign-in`,
      });

      await open('Commitment letter.docx');

      await shows(NOT_LOADED_MESSAGE);
      expect(bodyWasRead).toBe(false);
    });

    it('previews a file it was redirected to on the storage origin', async () => {
      servePreview(fixture('hostile.md'), {
        redirected: true,
        url: 'https://storage.example/signed/object',
      });

      await open('notes.md');

      await shows('# Diligence notes');
    });

    it('does not download a file declared larger than 50 MiB', async () => {
      servePreview(fixture('hostile.docx'), {
        contentLength: 50 * MEBIBYTE + 1,
      });

      await open('Commitment letter.docx');

      await shows(TOO_LARGE_MESSAGE);
      expect(bodyWasRead).toBe(false);
    });

    it('previews a file declared at exactly 50 MiB', async () => {
      servePreview(fixture('sample.xlsx'), { contentLength: 50 * MEBIBYTE });

      await open('Rent roll.xlsx');

      await shows('Revenue');
    });

    it('does not download a text file declared larger than 2 MiB', async () => {
      servePreview(fixture('hostile.md'), { contentLength: 2 * MEBIBYTE + 1 });

      await open('notes.md');

      await shows(TOO_LARGE_MESSAGE);
      expect(bodyWasRead).toBe(false);
    });

    it('does not show a text file that turns out larger than 2 MiB when no size was declared', async () => {
      servePreview(new ArrayBuffer(2 * MEBIBYTE + 1));

      await open('notes.md');

      await shows(TOO_LARGE_MESSAGE);
    });

    it('says the file could not be loaded, and logs why, when a viewer library fails to load', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.doMock('mammoth', () => {
        throw new Error('Loading chunk failed');
      });
      servePreview(fixture('hostile.docx'));

      await open('Commitment letter.docx');

      await shows(NOT_LOADED_MESSAGE);
      expect(logged).toHaveBeenCalled();
    });
  });

  describe('PDF', () => {
    let paneWidth: number;
    let paneObservers: Set<() => void>;

    class FakeResizeObserver {
      constructor(private readonly notify: () => void) {}
      observe() {
        paneObservers.add(this.notify);
        this.notify();
      }
      disconnect() {
        paneObservers.delete(this.notify);
      }
    }

    async function resizePane(width: number) {
      paneWidth = width;
      await act(async () => {
        paneObservers.forEach((notify) => notify());
        await new Promise((settle) => setTimeout(settle, 50));
      });
    }

    beforeEach(async () => {
      vi.stubGlobal('pdfjsWorker', await import(/* @vite-ignore */ PDF_WORKER));
      paneWidth = 448;
      paneObservers = new Set();
      vi.stubGlobal('ResizeObserver', FakeResizeObserver);
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
        () => paneWidth,
      );
    });

    it('says a password-protected PDF is password protected', async () => {
      servePreview(fixture('locked.pdf'));

      await open('Tax return.pdf');

      await shows(PASSWORD_MESSAGE);
    });

    describe('on a canvas that draws', () => {
      function drawingContext(): unknown {
        const context: unknown = new Proxy(function () {}, {
          get: (_, key) =>
            key === 'then'
              ? undefined
              : ['a', 'd', 'width', 'height'].includes(String(key))
                ? 1
                : ['b', 'c', 'e', 'f'].includes(String(key))
                  ? 0
                  : context,
          apply: () => context,
          set: () => true,
        });
        return context;
      }

      beforeEach(() => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
          () => drawingContext() as never,
        );
        servePreview(fixture('sample.pdf'));
      });

      it('opens on the first page', async () => {
        await open('Term sheet.pdf');

        await shows('Page 1 of 2');
      });

      it('opens on the page asked for', async () => {
        await open('Term sheet.pdf', 2);

        await shows('Page 2 of 2');
      });

      it('shows a Word file through its PDF rendition, on the page asked for', async () => {
        await open('Lease.docx', 2);

        await shows('Page 2 of 2');
      });

      it('opens on the last page when asked for one past the end', async () => {
        await open('Term sheet.pdf', 9);

        await shows('Page 2 of 2');
      });

      it('fits a 200 pt page to a 448 px pane at 150%', async () => {
        await open('Term sheet.pdf');

        await shows('150%');
      });

      it('refits the page when the pane narrows', async () => {
        await open('Term sheet.pdf');
        await shows('150%');

        await resizePane(288);

        await shows('90%');
      });

      it('keeps a zoom chosen by hand when the pane narrows', async () => {
        await open('Term sheet.pdf');
        await shows('150%');
        act(() => {
          container
            .querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!
            .click();
        });
        await shows('200%');

        await resizePane(288);

        expect(container.textContent).toContain('200%');
      });
    });

    it('falls back to the unsupported panel when a page cannot be rendered', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      servePreview(fixture('sample.pdf'));

      await open('Term sheet.pdf');

      await shows(UNSUPPORTED_MESSAGE);
    });
  });

  describe('Word', () => {
    it('renders a Word file inside a frame that cannot run script or load anything', async () => {
      servePreview(fixture('hostile.docx'));

      await open('Commitment letter.docx');

      const frame = await vi.waitFor(() => {
        const element = container.querySelector('iframe');
        expect(element).not.toBeNull();
        return element!;
      });
      expect(frame.getAttribute('sandbox')).toBe('');
      expect(frame.getAttribute('srcdoc')).toContain('Covenant summary');
      expect(frame.getAttribute('srcdoc')).not.toContain('tracker.example');
      expect(frame.hasAttribute('src')).toBe(false);
    });
  });

  describe('spreadsheets', () => {
    function selectedSheet() {
      return container.querySelector('[role="tab"][aria-selected="true"]')
        ?.textContent;
    }

    it('opens on the sheet asked for', async () => {
      servePreview(fixture('sample.xlsx'));

      await open('Rent roll.xlsx', undefined, 'Rent roll');

      await vi.waitFor(() => expect(selectedSheet()).toBe('Rent roll'));
    });

    it('opens on the first sheet when the one asked for does not exist', async () => {
      servePreview(fixture('sample.xlsx'));

      await open('Rent roll.xlsx', undefined, 'Budget');

      await vi.waitFor(() => expect(selectedSheet()).toBe('Summary'));
    });

    it('shows a CSV as its one sheet whatever sheet is asked for', async () => {
      servePreview(fixture('sample.csv'));

      await open('Rent roll.csv', undefined, 'Rent roll');

      await vi.waitFor(() =>
        expect(container.querySelectorAll('[role="tab"]')).toHaveLength(1),
      );
      expect(selectedSheet()).toBe(
        container.querySelector('[role="tab"]')?.textContent,
      );
    });

    it('shows a tab per sheet', async () => {
      servePreview(fixture('sample.xlsx'));

      await open('Rent roll.xlsx');

      await shows('Revenue');
      const tabs = [...container.querySelectorAll('[role="tab"]')].map(
        (tab) => tab.textContent,
      );
      expect(tabs).toEqual(['Summary', 'Rent roll']);
    });

    it('shows the cells of the open sheet as a grid', async () => {
      servePreview(fixture('sample.xlsx'));

      await open('Rent roll.xlsx');

      await shows('Revenue');
      const rows = [...container.querySelectorAll('tr')].map((row) =>
        [...row.querySelectorAll('td')].map((cell) => cell.textContent),
      );
      expect(rows).toEqual([
        ['1', 'Metric', 'Value'],
        ['2', 'Revenue', '1200'],
        ['3', 'EBITDA', '300'],
      ]);
    });

    it('says when only the first 50 columns are shown', async () => {
      servePreview(fixture('wide.csv'));

      await open('wide.csv');

      await shows('Showing the first 50 columns');
    });

    it('says when only the first 2,000 rows are shown', async () => {
      servePreview(encoded('row\n'.repeat(2001)));

      await open('tall.csv');

      await shows('Showing the first 2,000 rows');
    });

    it('says when a sheet is clipped at both limits', async () => {
      servePreview(fixture('sample.xlsx'));
      vi.mocked(parsePreview).mockResolvedValueOnce({
        kind: 'sheet',
        sheets: [
          {
            name: 'Corners',
            rows: [['first']],
            clippedRows: true,
            clippedColumns: true,
          },
        ],
      });

      await open('Rent roll.xlsx');

      await shows('Showing the first 2,000 rows and 50 columns');
    });

    it('says nothing about clipping for a sheet shown whole', async () => {
      servePreview(fixture('sample.xlsx'));

      await open('Rent roll.xlsx');

      await shows('Revenue');
      expect(container.textContent).not.toContain('Showing the first');
    });
  });

  describe('email', () => {
    it('shows the subject of an Outlook message', async () => {
      servePreview(fixture('plain.msg'));

      await open('Re: rent roll.msg');

      await shows('Updated rent roll');
      expect(container.querySelector('h3')?.textContent).toBe(
        'Updated rent roll',
      );
    });

    it('shows who sent it', async () => {
      servePreview(fixture('plain.msg'));

      await open('Re: rent roll.msg');

      await shows('Updated rent roll');
      expect(definition('From')).toBe('Dana Whitfield dana@firstbank.example');
    });

    it('shows who it was sent to', async () => {
      servePreview(fixture('plain.msg'));

      await open('Re: rent roll.msg');

      await shows('Updated rent roll');
      expect(definition('To')).toBe('Sam Ortiz sam@buyer.example');
    });

    it('shows who was copied', async () => {
      servePreview(fixture('plain.msg'));

      await open('Re: rent roll.msg');

      await shows('Updated rent roll');
      expect(definition('Cc')).toBe('Lee Park lee@buyer.example');
    });

    it('shows when it was received', async () => {
      servePreview(fixture('plain.msg'));

      await open('Re: rent roll.msg');

      await shows('Updated rent roll');
      expect(definition('Date')).toBe('Wed, 04 Mar 2026 15:30:00 GMT');
    });

    it('shows a plain-text body', async () => {
      servePreview(fixture('plain.msg'));

      await open('Re: rent roll.msg');

      await shows('Please see the attached rent roll.');
    });

    it('lists attachment names', async () => {
      servePreview(fixture('plain.msg'));

      await open('Re: rent roll.msg');

      await shows('Updated rent roll');
      const names = [...container.querySelectorAll('li')].map(
        (item) => item.textContent,
      );
      expect(names).toEqual(['rent-roll.xlsx']);
    });

    it('leaves out the Cc line when nobody was copied', async () => {
      servePreview(fixture('hostile.eml'));

      await open('Re: rent roll.eml');

      await shows('Updated rent roll');
      const labels = [...container.querySelectorAll('dt')].map(
        (label) => label.textContent,
      );
      expect(labels).toEqual(['From', 'To', 'Date']);
    });

    it('shows a recipient with no address by name alone', async () => {
      servePreview(fixture('bare.msg'));

      await open('Lease.msg');

      await shows('Inline image');
      expect(definition('To')).toBe('Sam Ortiz');
    });

    it('renders an HTML body inside a frame that cannot run script or load anything', async () => {
      servePreview(fixture('hostile.msg'));

      await open('Re: rent roll.msg');

      await shows('Updated rent roll');
      const frame = container.querySelector('iframe')!;
      expect(frame.getAttribute('sandbox')).toBe('');
      expect(frame.getAttribute('srcdoc')).toContain('rent roll');
      expect(frame.getAttribute('srcdoc')).not.toContain('tracker.example');
      expect(frame.getAttribute('srcdoc')).not.toContain('alert(');
    });
  });

  describe('text', () => {
    it('shows a text file in a preformatted block', async () => {
      servePreview(fixture('hostile.md'));

      await open('notes.md');

      await shows('# Diligence notes');
      expect(container.querySelector('pre')?.textContent).toContain(
        '<script>alert(1)</script>',
      );
    });

    it('never turns the markup in a text file into elements', async () => {
      servePreview(fixture('hostile.md'));

      await open('notes.md');

      await shows('# Diligence notes');
      expect(container.querySelector('script, img, [onerror]')).toBeNull();
    });
  });
});
