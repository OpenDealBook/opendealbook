// @vitest-environment jsdom
import { act, type ReactNode } from 'react';

import { NextIntlClientProvider } from 'next-intl';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../../messages/en.json';

const DEAL = '11111111-1111-4111-8111-111111111111';
const TEAM = '22222222-2222-4222-8222-222222222222';

type Row = Record<string, unknown>;

const room = vi.hoisted(() => ({
  folders: [] as Row[],
  documents: [] as Row[],
  objects: [] as { name: string; metadata: { size: number } }[],
  lenderViews: [] as Row[],
  sellerViews: [] as Row[],
  permissions: new Set<string>(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined }),
  useParams: () => ({ account: 'acme', id: DEAL }),
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en-US',
  getTranslations: async (namespace: string) => {
    const { createTranslator } = await import('next-intl');
    return createTranslator({
      locale: 'en-US',
      messages,
      namespace: namespace as 'dataRoom',
    });
  },
}));
vi.mock('./viewer-time-zone', () => ({
  viewerTimeZone: async () => 'America/Los_Angeles',
}));
vi.mock('./data-room-folder-action', () => ({
  createDataRoomFolder: async () => ({ ok: true, value: {} }),
}));
vi.mock('@odb/data-room/uploads/actions', () => ({
  stageUpload: async () => undefined,
}));
vi.mock('./expand-data-room-upload', () => ({
  expandDataRoomUpload: async () => undefined,
}));
vi.mock('@odb/data-room', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odb/data-room')>()),
  fetchFolders: async () => room.folders,
  fetchDocuments: async () => room.documents,
}));
vi.mock('@odb/supabase/server', () => {
  const MAX_ROWS = 1000;
  const activity = (rows: () => Row[]) => {
    let from = 0;
    let to = Number.POSITIVE_INFINITY;
    const query = {
      select: () => query,
      eq: () => query,
      in: () => query,
      not: () => query,
      order: () => query,
      range: (start: number, end: number) => {
        from = start;
        to = end;
        return query;
      },
      throwOnError: async () => ({
        data: rows().slice(from, Math.min(to + 1, from + MAX_ROWS)),
      }),
    };
    return query;
  };

  return {
    getSupabaseServerClient: () => ({
      rpc: (name: string, args: { permission?: string }) => ({
        throwOnError: async () => ({
          data:
            name === 'deal_people'
              ? [
                  { user_id: 'u-ana', name: 'Ana Ruiz', email: 'ana@x.co' },
                  { user_id: 'u-ben', name: 'Ben Ito', email: 'ben@x.co' },
                ]
              : room.permissions.has(args.permission!),
        }),
      }),
      from: (table: string) =>
        activity(() =>
          table === 'lender_room_activity'
            ? room.lenderViews
            : room.sellerViews,
        ),
      storage: {
        from: () => ({
          list: async (prefix: string) => ({
            data: prefix === `deal/${DEAL}` ? room.objects : ([] as unknown[]),
            error: null,
          }),
        }),
      },
    }),
  };
});

import { DataRoomSection } from './data-room-section';

function folder(id: string, name: string, parent_id: string | null = null) {
  return { id, name, parent_id, sort_order: null };
}

function file(id: string, folder_id: string, name: string, version = 1) {
  return {
    id,
    folder_id,
    name,
    version,
    storage_path: `deal/${DEAL}/${id}-${name}`,
    created_at: '2026-10-01T02:00:00Z',
    uploaded_by: 'u-ana',
    removed_at: null,
  };
}

function withIntl(node: ReactNode) {
  return (
    <NextIntlClientProvider locale={'en-US'} messages={messages}>
      {node}
    </NextIntlClientProvider>
  );
}

async function render() {
  const html = renderToStaticMarkup(
    withIntl(await DataRoomSection({ dealId: DEAL, accountId: TEAM })),
  );
  return new DOMParser().parseFromString(html, 'text/html');
}

function texts(page: Document, selector: string) {
  return [...page.querySelectorAll(selector)].map((node) =>
    node.textContent?.trim(),
  );
}

function rowOf(page: Document, name: string) {
  return [...page.querySelectorAll('tbody tr')].find((row) =>
    row.textContent?.includes(name),
  )!;
}

function buttons(page: Document, label: string) {
  return [...page.querySelectorAll('button')].filter(
    (button) => button.textContent === label,
  );
}

beforeEach(() => {
  room.folders = [
    folder('f-fin', 'Financials'),
    folder('f-tax', 'Tax returns', 'f-fin'),
    folder('f-leg', 'Legal'),
  ];
  room.documents = [
    file('d-pl', 'f-fin', 'P&L 2025.xlsx'),
    file('d-ret', 'f-tax', '2024 return.pdf'),
    file('d-lease1', 'f-leg', 'Lease.pdf', 1),
    file('d-lease2', 'f-leg', 'Lease.pdf', 2),
  ];
  room.objects = [
    { name: 'd-pl-P&L 2025.xlsx', metadata: { size: 1536 } },
    { name: 'd-ret-2024 return.pdf', metadata: { size: 5 * 1024 * 1024 } },
  ];
  room.lenderViews = [];
  room.sellerViews = [];
  room.permissions = new Set(['deals.work', 'deals.manage']);
});

describe('DataRoomSection', () => {
  it('lists the whole room in one table under a single header', async () => {
    const page = await render();

    expect(page.querySelectorAll('table')).toHaveLength(1);
    expect(page.querySelectorAll('thead tr')).toHaveLength(1);
    expect(texts(page, 'thead th')).toEqual([
      'No.',
      'Name',
      'Size',
      'Uploaded',
      'Version',
      'Actions',
    ]);
  });

  it('numbers every folder and file from the room order', async () => {
    const page = await render();

    expect(
      texts(page, 'tbody tr td:first-child').filter((cell) => cell !== ''),
    ).toEqual(['1', '1.1', '1.1.1', '1.2', '2', '2.1']);
    expect(rowOf(page, 'P&L 2025.xlsx').textContent).toContain('1.2');
  });

  it('shows size, uploader with the date in the viewer time zone, and version', async () => {
    const page = await render();
    const cells = texts(rowOf(page, 'P&L 2025.xlsx') as never, 'td');

    expect(cells).toContain('1.5 KB');
    expect(cells).toContain('Ana RuizSep 30, 2026');
    expect(cells).toContain('v1');
    expect(texts(rowOf(page, '2024 return.pdf') as never, 'td')).toContain(
      '5 MB',
    );
  });

  it('marks a size it cannot find as missing', async () => {
    const page = await render();
    const missing = rowOf(page, 'Lease.pdf').querySelector(
      '[data-slot=missing-value]',
    );

    expect(missing?.getAttribute('aria-label')).toBe('Size not available');
  });

  it('gives a versioned document one numbered row for its latest version', async () => {
    const page = await render();
    const leases = [...page.querySelectorAll('tbody tr')].filter((row) =>
      row.textContent?.includes('Lease.pdf'),
    );

    expect(leases).toHaveLength(1);
    expect(texts(leases[0] as never, 'td')[0]).toBe('2.1');
    expect(texts(leases[0] as never, 'button')).toContain('v2 · history');
    expect(texts(rowOf(page, 'P&L 2025.xlsx') as never, 'button')).toEqual([
      'Open',
    ]);
  });

  it('opens the older versions from the history control, each with Open', async () => {
    room.documents.push(file('d-lease0', 'f-leg', 'Lease.pdf', 0));
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const section = await DataRoomSection({ dealId: DEAL, accountId: TEAM });

    await act(async () => root.render(withIntl(section)));
    await act(async () =>
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent === 'v2 · history')!
        .click(),
    );

    const dialog = document.querySelector('[role=dialog]')!;
    const rows = [...dialog.querySelectorAll('tbody tr')];

    expect(dialog.querySelector('h2')?.textContent).toBe(
      'Earlier versions of Lease.pdf',
    );
    expect(rows.map((row) => row.querySelector('td')?.textContent)).toEqual([
      'v1',
      'v0',
    ]);
    expect(rows.map((row) => row.querySelector('button')?.textContent)).toEqual(
      ['Open', 'Open'],
    );
    expect(rows[0]!.textContent).toContain('Ana Ruiz');
    act(() => root.unmount());
    container.remove();
  });

  it('leaves out Views when no document has recorded views', async () => {
    const page = await render();

    expect(texts(page, 'thead th')).not.toContain('Views');
  });

  it('counts lender and seller room previews and downloads as views', async () => {
    room.lenderViews = [{ dr_document_id: 'd-pl' }, { dr_document_id: 'd-pl' }];
    room.sellerViews = [{ dr_document_id: 'd-pl' }];

    const page = await render();
    const header = texts(page, 'thead th');
    const viewsColumn = header.indexOf('Views');

    expect(viewsColumn).toBeGreaterThan(-1);
    expect(
      texts(rowOf(page, 'P&L 2025.xlsx') as never, 'td')[viewsColumn],
    ).toBe('3');
    expect(
      texts(rowOf(page, '2024 return.pdf') as never, 'td')[viewsColumn],
    ).toBe('0');
  });

  it('shows a folded row with the latest version size and uploader and views summed across versions', async () => {
    room.documents = room.documents.map((document) =>
      document.id === 'd-lease1'
        ? { ...document, uploaded_by: 'u-ben' }
        : document,
    );
    room.objects.push(
      { name: 'd-lease1-Lease.pdf', metadata: { size: 1024 } },
      { name: 'd-lease2-Lease.pdf', metadata: { size: 2048 } },
    );
    room.lenderViews = [
      { dr_document_id: 'd-lease1' },
      { dr_document_id: 'd-lease2' },
    ];
    room.sellerViews = [{ dr_document_id: 'd-lease1' }];

    const page = await render();
    const viewsColumn = texts(page, 'thead th').indexOf('Views');
    const cells = texts(rowOf(page, 'Lease.pdf') as never, 'td');

    expect(cells).toContain('2 KB');
    expect(cells).not.toContain('1 KB');
    expect(cells).toContain('Ana RuizSep 30, 2026');
    expect(cells[viewsColumn]).toBe('3');
  });

  it('offers one Upload and one Create folder above the table', async () => {
    const page = await render();
    const table = page.querySelector('table')!;
    const [upload] = buttons(page, 'Upload');

    expect(buttons(page, 'Upload')).toHaveLength(1);
    expect(buttons(page, 'Create folder')).toHaveLength(1);
    expect(
      upload!.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('lets the top Upload target any folder in the room', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const section = await DataRoomSection({ dealId: DEAL, accountId: TEAM });

    await act(async () => root.render(withIntl(section)));
    await act(async () =>
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent === 'Upload')!
        .click(),
    );

    expect(container.textContent).toContain('Folder');
    expect(
      container.querySelector('[data-slot=select-value]')?.textContent,
    ).toBe('Choose a folder');
    act(() => root.unmount());
    container.remove();
  });

  it('presets the empty folder Upload to that folder', async () => {
    room.documents = [file('d-pl', 'f-fin', 'P&L 2025.xlsx')];
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const section = await DataRoomSection({ dealId: DEAL, accountId: TEAM });

    await act(async () => root.render(withIntl(section)));
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[data-slot=empty-state] button')!
        .click(),
    );

    expect(
      container.querySelector('[data-slot=select-value]')?.textContent,
    ).toBe('Financials / Tax returns');
    act(() => root.unmount());
    container.remove();
  });

  it('shows an empty folder as an empty state with Upload for that folder', async () => {
    room.documents = [file('d-pl', 'f-fin', 'P&L 2025.xlsx')];

    const page = await render();
    const empty = [...page.querySelectorAll('[data-slot=empty-state]')];

    expect(
      empty.map((state) => state.querySelector('h2')?.textContent),
    ).toEqual(['Tax returns is empty', 'Legal is empty']);
    expect(texts(empty[0] as never, 'button')).toEqual(['Upload']);
  });

  it('hides Upload and Create folder from members who cannot add documents', async () => {
    room.permissions = new Set();
    room.documents = [];

    const page = await render();

    expect(
      texts(page, '[data-slot=empty-state] > div').filter(Boolean),
    ).toEqual([
      'Ask a teammate who can upload documents to add them here.',
      'Ask a teammate who can upload documents to add them here.',
    ]);
    expect(buttons(page, 'Upload')).toHaveLength(0);
    expect(buttons(page, 'Create folder')).toHaveLength(0);
  });

  it('lets workers upload but not create folders', async () => {
    room.permissions = new Set(['deals.work']);

    const page = await render();

    expect(buttons(page, 'Upload')).toHaveLength(1);
    expect(buttons(page, 'Create folder')).toHaveLength(0);
  });

  it('tells a member who cannot create folders whom to ask in an empty room', async () => {
    room.folders = [];
    room.documents = [];
    room.permissions = new Set(['deals.work']);

    const page = await render();
    const empty = page.querySelector('[data-slot=empty-state]')!;

    expect(empty.textContent).toContain(
      'Ask a teammate who can manage this deal to create a folder.',
    );
    expect(empty.querySelectorAll('button')).toHaveLength(0);
  });

  it('counts every view, past the rows one query returns', async () => {
    room.lenderViews = Array.from({ length: 2500 }, () => ({
      dr_document_id: 'd-pl',
    }));
    room.sellerViews = [{ dr_document_id: 'd-pl' }];

    const page = await render();
    const viewsColumn = texts(page, 'thead th').indexOf('Views');

    expect(
      texts(rowOf(page, 'P&L 2025.xlsx') as never, 'td')[viewsColumn],
    ).toBe('2501');
  });

  it('marks a file with no recorded uploader as missing', async () => {
    room.documents = room.documents.map((document) =>
      document.id === 'd-pl' ? { ...document, uploaded_by: null } : document,
    );

    const page = await render();
    const missing = [
      ...rowOf(page, 'P&L 2025.xlsx').querySelectorAll(
        '[data-slot=missing-value]',
      ),
    ].map((node) => node.getAttribute('aria-label'));

    expect(missing).toEqual(['Uploader not recorded']);
  });

  it('shows an empty room with Create folder and no table', async () => {
    room.folders = [];
    room.documents = [];

    const page = await render();
    const empty = page.querySelector('[data-slot=empty-state]')!;

    expect(empty.querySelector('h2')?.textContent).toBe('No folders yet');
    expect(texts(empty as never, 'button')).toEqual(['Create folder']);
    expect(page.querySelector('table')).toBeNull();
    expect(buttons(page, 'Upload')).toHaveLength(0);
  });

  it('shows the folder tree with numbers that jump to each folder', async () => {
    const page = await render();
    const links = [...page.querySelectorAll('nav a')];

    expect(links.map((link) => link.textContent)).toEqual([
      '1Financials',
      '1.1Tax returns',
      '2Legal',
    ]);
    for (const link of links) {
      expect(
        page.getElementById(link.getAttribute('href')!.slice(1)),
      ).not.toBeNull();
    }
  });

  it('keeps Open on every file and the data room window link', async () => {
    const page = await render();

    expect(buttons(page, 'Open')).toHaveLength(3);
    expect(buttons(page, 'Open in data room window')).toHaveLength(1);
    expect(page.querySelector('header h2')?.textContent).toBe('Data room');
  });

  it('does not warn that storage is unprovisioned', async () => {
    const page = await render();

    expect(page.body.textContent).not.toContain(
      'not declared in the database schema',
    );
    expect(page.body.textContent).not.toContain('storage provisioning');
  });
});
