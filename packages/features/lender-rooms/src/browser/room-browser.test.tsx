// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RoomFile, RoomFolder } from '../contents/listing';
import type { RoomPlaces } from './room-places';
import type { UnfinishedUpload } from './unfinished-uploads';

const server = vi.hoisted(() => ({
  foldersOpened: [] as unknown[],
  roomsOpened: [] as unknown[],
  recordingRefusal: null as string | null,
  begun: [] as { folderId: string; name: string }[],
  registered: [] as { uploadId: string; keepAsZip: boolean }[],
  cancelled: [] as string[],
  foldersCreated: [] as unknown[],
  trees: [] as { rootName: string }[],
  refreshes: 0,
  storageGate: null as Promise<void> | null,
  unfinished: [] as UnfinishedUpload[],
  browserKeepsFiles: true,
  sessionUserId: null as string | null,
  authListener: null as
    | ((event: string, session: { user: { id: string } } | null) => void)
    | null,
  reloads: 0,
  sentElsewhere: [] as string[],
  answeredElsewhere: [] as (() => void)[],
  answersAnnounced: [] as string[],
}));

vi.mock('./signed-in-user', () => ({
  signedInUserId: async () => server.sessionUserId,
}));

vi.mock('./reload-page', () => ({
  reloadPage: () => {
    server.reloads += 1;
  },
}));

vi.mock('./tab-coordination', () => ({
  holdWhileSending: () => () => {},
  lockNamesHeldElsewhere: async () => server.sentElsewhere,
  announceAnswered: (owner: string) =>
    server.answersAnnounced.push(
      `${owner} with ${server.unfinished.length} still remembered`,
    ),
  onAnsweredElsewhere: (_owner: string, listener: () => void) => {
    server.answeredElsewhere.push(listener);

    return () => {};
  },
}));

vi.mock('./unfinished-store', () => ({
  unfinishedStore: {
    put: async (upload: UnfinishedUpload) => {
      if (upload.file && !server.browserKeepsFiles) {
        throw new Error('QuotaExceededError');
      }

      server.unfinished = [
        ...server.unfinished.filter((each) => each.id !== upload.id),
        upload,
      ];
    },
    remove: async (id: string) => {
      server.unfinished = server.unfinished.filter((each) => each.id !== id);
    },
    listForPerson: async (userId: string) =>
      server.unfinished.filter((each) => each.userId === userId),
  },
  forgottenIds: { read: () => [], write: () => {} },
  reportStoreFailure: () => {},
}));

vi.mock('../uploads/folder-actions', () => ({
  createFolder: async (input: { name: string }) => {
    if (input.name === 'Taken') {
      return { ok: false, refusal: 'A folder named Taken is already here' };
    }

    server.foldersCreated.push(input);

    return { ok: true, value: 'new-folder-id' };
  },
  createFolderTree: async (input: { rootName: string }) => {
    server.trees.push(input);

    if (input.rootName === 'Offline') {
      throw new Error('fetch failed');
    }

    if (input.rootName === 'Expired') {
      const { SESSION_ENDED } = await import('../actions/refusal');

      return { ok: false, refusal: SESSION_ENDED };
    }

    if (input.rootName === 'Huge') {
      return { ok: false, refusal: 'Huge has too many folders to add' };
    }

    return {
      ok: true,
      value: {
        rootFolderId: input.rootName === '.Trash' ? null : 'root-id',
        folderIds: { Tax: 'tax-id' },
      },
    };
  },
}));

vi.mock('../activity/actions', () => {
  const answer = () =>
    server.recordingRefusal
      ? { ok: false, refusal: server.recordingRefusal }
      : { ok: true, value: null };

  return {
    recordRoomOpened: async (input: unknown) => {
      server.roomsOpened.push(input);

      return answer();
    },
    recordFolderOpened: async (input: unknown) => {
      server.foldersOpened.push(input);

      return answer();
    },
  };
});

vi.mock('../uploads/actions', () => ({
  beginUpload: async (input: { folderId: string; name: string }) => {
    server.begun.push(input);

    return input.name === 'refused.pdf'
      ? { ok: false, refusal: 'The room is closed' }
      : {
          ok: true,
          value: { uploadId: `upload:${input.name}`, path: 'p', token: 't' },
        };
  },
  registerUpload: async (input: { uploadId: string; keepAsZip: boolean }) => {
    if (input.uploadId === 'upload:crash.zip') {
      throw new Error('the register step crashed');
    }

    server.registered.push(input);

    return { ok: true, value: [`document:${input.uploadId}`] };
  },
  cancelUpload: async ({ uploadId }: { uploadId: string }) => {
    server.cancelled.push(uploadId);

    return { ok: true, value: undefined };
  },
}));

vi.mock('../asks/lender-actions', () => ({ openAsk: async () => ({}) }));
vi.mock('../viewer/file-viewer', () => ({
  FileViewer: (viewer: { fileName: string; previewUrl: string }) => (
    <>
      <h2>{viewer.fileName}</h2>
      <p data-preview-url>{viewer.previewUrl}</p>
    </>
  ),
}));
vi.mock('@odb/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      onAuthStateChange: (
        listener: (
          event: string,
          session: { user: { id: string } } | null,
        ) => void,
      ) => {
        server.authListener = listener;

        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
    storage: {
      from: () => ({
        uploadToSignedUrl: async () => {
          await server.storageGate;

          return { error: null };
        },
      }),
    },
  }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: () => {
      server.refreshes += 1;
    },
  }),
  usePathname: () => '/lender/room',
}));

import { RoomBrowser } from './room-browser';
import { lockName } from './unfinished-uploads';

const ROOM = '7d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';
const OWN = '0a2c7b8e-41d7-4b4e-8f39-6b2f7a0a2b22';
const FINANCIALS = '5b1d7c3a-2f64-4c0e-9d0b-1f6a3e2c4d55';
const ANA = 'user-ana';

function file(
  folderId: string,
  name: string,
  rest: Partial<RoomFile> = {},
): RoomFile {
  return {
    kind: 'file',
    documentId: name,
    version: 1,
    createdAt: '2026-10-01T00:00:00Z',
    folderId,
    name,
    type: name.split('.').at(-1)!.toUpperCase(),
    visitMark: 'seen',
    earlierVersions: [],
    ...rest,
  };
}

const financials: RoomFolder = {
  id: FINANCIALS,
  name: 'Financials',
  folders: [],
  entries: [
    file(FINANCIALS, 'zeta.csv', { createdAt: '2026-10-02T00:00:00Z' }),
    file(FINANCIALS, 'alpha.xlsx', { createdAt: '2026-10-01T00:00:00Z' }),
    file(FINANCIALS, 'mid.docx', { createdAt: '2026-10-03T00:00:00Z' }),
  ],
};

const shared: RoomFolder = {
  id: 'package',
  name: 'Lender package',
  folders: [
    financials,
    { id: 'environmental', name: 'Environmental', folders: [], entries: [] },
  ],
  entries: [
    file('package', 'a.pdf'),
    file('package', 'b.pdf'),
    file('package', 'c.pdf'),
    file('package', 'd.pdf'),
    file('package', 'e.pdf', {
      version: 2,
      visitMark: 'new',
      earlierVersions: [
        { documentId: 'e-v1', version: 1, createdAt: '2026-09-01T00:00:00Z' },
      ],
    }),
  ],
};

const own: RoomFolder = {
  id: OWN,
  name: 'First Harbor Bank',
  folders: [],
  entries: [],
};

function press(key: string, shiftKey = false) {
  return act(async () => {
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }),
    );
  });
}

function buttonNamed(name: string) {
  return [...document.querySelectorAll('button')].find(
    (button) =>
      button.textContent === name || button.getAttribute('aria-label') === name,
  )!;
}

function click(element: Element) {
  return act(async () => {
    (element as HTMLElement).click();
  });
}

function tick(milliseconds = 0) {
  return act(() => new Promise((resolve) => setTimeout(resolve, milliseconds)));
}

function alerts() {
  return [...document.querySelectorAll('[role=alert]')].map(
    (alert) => alert.textContent,
  );
}

function listedFiles() {
  return [...document.querySelectorAll('[data-file-id]')].map((row) =>
    row.getAttribute('data-file-id'),
  );
}

function breadcrumb() {
  return [...document.querySelectorAll('nav[aria-label="Breadcrumb"] li')].map(
    (step) => step.textContent,
  );
}

function uploadRows() {
  return [...document.querySelectorAll('ul[aria-label="Files"] li')].map(
    (row) => row.textContent,
  );
}

function dialogText() {
  return document.querySelector('[role=dialog]')?.textContent ?? null;
}

function fileEntry(name: string) {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file: (found: (file: File) => void) => found(new File(['x'], name)),
  };
}

function unreadableEntry(name: string) {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file: (_found: unknown, failed: (error: Error) => void) =>
      failed(new Error('NotReadableError')),
  };
}

function folderEntry(name: string, children: unknown[]) {
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => {
      let isRead = false;

      return {
        readEntries: (found: (entries: unknown[]) => void) => {
          found(isRead ? [] : children);
          isRead = true;
        },
      };
    },
  };
}

function dragEvent(type: string, entries: { name: string }[] = []) {
  const event = new Event(type, { bubbles: true });

  Object.assign(event, {
    dataTransfer: {
      items: entries.map((entry) => ({
        kind: 'file',
        webkitGetAsEntry: () => entry,
      })),
    },
  });

  return event;
}

async function dropping(...entries: { name: string }[]) {
  await act(async () => {
    document
      .querySelector('[data-drop-zone]')!
      .dispatchEvent(dragEvent('drop', entries));
  });
  await tick();
}

function openYourFiles() {
  return click(
    [
      ...document.querySelectorAll('nav[aria-label="Folders"] button'),
    ].find((button) => button.textContent === 'Your files')!,
  );
}

function openFinancials() {
  return click(
    document.querySelector(
      `[data-folder-id="${FINANCIALS}"] button.text-left`,
    )!,
  );
}

function zipForm() {
  return buttonNamed('Download selected').closest('form')!;
}

async function typeInto(field: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('RoomBrowser', () => {
  let container: HTMLDivElement;
  let root: Root;

  async function show(places: RoomPlaces = { shared, own }, userId = ANA) {
    server.sessionUserId = userId;
    await act(async () => {
      root.render(
        <RoomBrowser
          roomId={ROOM}
          userId={userId}
          places={places}
          packageLabel={'Dockside lender package'}
          dealName={'Dockside'}
        />,
      );
    });
    await tick();
  }

  async function showAgain(places?: RoomPlaces, userId?: string) {
    act(() => root.unmount());
    root = createRoot(container);
    await show(places, userId);
  }

  beforeEach(async () => {
    Object.assign(server, {
      foldersOpened: [],
      roomsOpened: [],
      recordingRefusal: null,
      begun: [],
      registered: [],
      cancelled: [],
      foldersCreated: [],
      trees: [],
      refreshes: 0,
      storageGate: null,
      unfinished: [],
      browserKeepsFiles: true,
      sessionUserId: ANA,
      authListener: null,
      reloads: 0,
      sentElsewhere: [],
      answeredElsewhere: [],
      answersAnnounced: [],
    });
    localStorage.clear();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    Element.prototype.scrollIntoView = () => {};
    Element.prototype.hasPointerCapture = () => false;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await show();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  describe('recording', () => {
    it('records the room open once when the page loads', () => {
      expect(server.roomsOpened).toEqual([{ roomId: ROOM }]);
    });

    it('records a folder when it is opened and shows where the person is', async () => {
      await openFinancials();

      expect(server.foldersOpened).toEqual([
        { roomId: ROOM, folderId: FINANCIALS },
      ]);
      expect(breadcrumb()).toEqual(['Dockside lender package', 'Financials']);
    });

    it('shows the refusal when opening the room is refused', async () => {
      server.recordingRefusal = 'This room has closed';
      await showAgain();

      expect(alerts()).toEqual(['This room has closed']);
    });

    it('shows the refusal when opening a folder is refused', async () => {
      server.recordingRefusal = 'This room has closed';
      await openFinancials();

      expect(alerts()).toEqual(['This room has closed']);
    });
  });

  describe('finding files', () => {
    it('labels the list columns Name, Type, and Added', () => {
      expect(
        [...document.querySelectorAll('[data-columns] span')]
          .map((column) => column.textContent)
          .filter(Boolean),
      ).toEqual(['Name', 'Type', 'Added']);
    });

    it('shows the same files as cards in grid view', async () => {
      await click(buttonNamed('Grid view'));

      expect(document.querySelector('[data-columns]')).toBeNull();
      expect(listedFiles()).toEqual([
        'a.pdf',
        'b.pdf',
        'c.pdf',
        'd.pdf',
        'e.pdf',
      ]);
    });

    it('searches by file name across the whole room and says where each result is', async () => {
      await typeInto(
        document.querySelector<HTMLInputElement>('input[type=search]')!,
        'ALPHA',
      );

      expect(listedFiles()).toEqual(['alpha.xlsx']);
      expect(
        document.querySelector('[data-file-id="alpha.xlsx"]')!.textContent,
      ).toContain('Dockside lender package / Financials');
    });

    it('says so when no file matches the search', async () => {
      await typeInto(
        document.querySelector<HTMLInputElement>('input[type=search]')!,
        'nothing',
      );

      expect(document.querySelector('[data-empty]')!.textContent).toBe(
        'No files named "nothing" in this room',
      );
    });

    async function sortBy(label: string) {
      const trigger = buttonNamed('Sort by');

      trigger.focus();
      await press('Enter');
      await click(
        [...document.querySelectorAll('[role=option]')].find(
          (option) => option.textContent === label,
        )!,
      );
    }

    it('sorts by name, by date, and by type', async () => {
      await openFinancials();

      expect(listedFiles()).toEqual(['alpha.xlsx', 'mid.docx', 'zeta.csv']);

      await sortBy('Date');

      expect(listedFiles()).toEqual(['alpha.xlsx', 'zeta.csv', 'mid.docx']);

      await sortBy('Type');

      expect(listedFiles()).toEqual(['zeta.csv', 'mid.docx', 'alpha.xlsx']);
    });

    it('remembers the chosen sort for the next visit', async () => {
      await openFinancials();
      await sortBy('Type');
      await showAgain();
      await openFinancials();

      expect(listedFiles()).toEqual(['zeta.csv', 'mid.docx', 'alpha.xlsx']);
    });

    it('switches between the shared package and their own files on a phone', async () => {
      await click(
        [...document.querySelectorAll('button[aria-pressed]')].find(
          (button) => button.textContent === 'Your files',
        )!,
      );

      expect(breadcrumb()).toEqual(['Your files']);
      expect(server.foldersOpened).toEqual([{ roomId: ROOM, folderId: OWN }]);
    });

    it('shows only what is new, wherever it is', async () => {
      await click(buttonNamed('New1'));

      expect(listedFiles()).toEqual(['e.pdf']);
    });

    it('says nothing is new when nothing is', async () => {
      await showAgain({
        shared: { ...shared, entries: shared.entries.slice(0, 4) },
        own,
      });
      await click(buttonNamed('New0'));

      expect(document.querySelector('[data-empty]')!.textContent).toBe(
        'Nothing new since your last visit',
      );
    });

    it('goes back to the package when the open folder is no longer shown', async () => {
      await openFinancials();
      await show({ shared: { ...shared, folders: [] }, own });

      expect(breadcrumb()).toEqual(['Dockside lender package']);
    });
  });

  describe('selecting and downloading', () => {
    it('selects a range with space then shift and arrow, and the zip form carries exactly those files', async () => {
      document.querySelector<HTMLElement>('[data-file-id="a.pdf"]')!.focus();

      await press(' ');
      await press('ArrowDown', true);
      await press('ArrowDown', true);

      expect(zipForm().getAttribute('action')).toBe(
        `/lender/${ROOM}/files/zip`,
      );
      expect(zipForm().method).toBe('post');
      expect(new FormData(zipForm()).getAll('documentIds')).toEqual([
        'a.pdf',
        'b.pdf',
        'c.pdf',
      ]);
    });

    it('selects a range with shift and click', async () => {
      const box = (name: string) =>
        document.querySelector<HTMLElement>(
          `[data-file-id="${name}"] [role=checkbox]`,
        )!;

      await click(box('b.pdf'));
      await act(async () => {
        box('d.pdf').dispatchEvent(
          new MouseEvent('click', { shiftKey: true, bubbles: true }),
        );
      });

      expect(new FormData(zipForm()).getAll('documentIds')).toEqual([
        'b.pdf',
        'c.pdf',
        'd.pdf',
      ]);
    });

    it('downloads a selected folder with a selected file as one zip of their files, and says what is selected', async () => {
      await click(buttonNamed('Select folder Financials'));
      await click(buttonNamed('Select a.pdf'));

      expect(new FormData(zipForm()).getAll('documentIds')).toEqual([
        'a.pdf',
        'zeta.csv',
        'alpha.xlsx',
        'mid.docx',
      ]);
      expect(
        zipForm().parentElement!.querySelector('[data-selection]')!
          .textContent,
      ).toBe('1 file, 1 folder selected');
    });
  });

  describe('opening a file', () => {
    it('opens a file with enter and gives focus back to its row when the preview closes', async () => {
      const row = document.querySelector<HTMLElement>(
        '[data-file-id="b.pdf"]',
      )!;

      row.focus();
      await press('Enter');

      expect(
        document.querySelector('[role=dialog] h2:not(.sr-only)')?.textContent,
      ).toBe('b.pdf');

      await press('Escape');
      await tick(10);

      expect(document.querySelector('[role=dialog]')).toBeNull();
      expect(document.activeElement).toBe(row);
    });

    it('opens an earlier version through its own document id', async () => {
      await click(
        document.querySelector('[data-file-id="e.pdf"] button.text-left')!,
      );

      expect(
        document.querySelector('[data-preview-url]')!.textContent,
      ).toContain('/files/e.pdf?');

      await click(
        [...document.querySelectorAll('[aria-label="Versions"] button')].find(
          (version) => version.textContent!.startsWith('Version 1'),
        )!,
      );

      expect(
        document.querySelector('[data-preview-url]')!.textContent,
      ).toContain('/files/e-v1?');
    });

    it('keeps the preview open on the same version when the listing refreshes', async () => {
      await click(
        document.querySelector('[data-file-id="e.pdf"] button.text-left')!,
      );
      await click(
        [...document.querySelectorAll('[aria-label="Versions"] button')].find(
          (version) => version.textContent!.startsWith('Version 1'),
        )!,
      );
      await show({
        shared: {
          ...shared,
          entries: shared.entries.map((entry) => ({ ...entry })),
        },
        own: { ...own, entries: [file(OWN, 'just-added.pdf')] },
      });

      expect(
        document.querySelector('[data-preview-url]')?.textContent,
      ).toContain('/files/e-v1?');
    });
  });

  describe('requesting', () => {
    async function requestAbout(name: string) {
      const actions = buttonNamed(`Actions for ${name}`);

      actions.focus();
      await press('Enter');
      await click(
        [...document.querySelectorAll('[role=menuitem]')].find(
          (item) => item.textContent === 'Request something about this file',
        )!,
      );
    }

    it('names the persistent button after the dialog it opens', async () => {
      await click(buttonNamed('Request something'));

      expect(
        document.querySelector('[role=dialog] h2')!.textContent,
      ).toBe('Request something');
    });

    it('opens the request composer about a file from its menu, and asks before discarding what was typed', async () => {
      await requestAbout('b.pdf');

      expect(dialogText()).toContain('About b.pdf');

      await typeInto(
        document.querySelector<HTMLInputElement>(
          '[role=dialog] input[required]',
        )!,
        'Is this current?',
      );
      await click(buttonNamed('Cancel'));

      expect(buttonNamed('Discard')).toBeDefined();

      await click(buttonNamed('Discard'));
      await tick(30);

      expect(document.querySelector('[role=dialog]')).toBeNull();
      expect(document.activeElement).toBe(
        document.querySelector('[data-file-id="b.pdf"]'),
      );
    });
  });

  describe('adding files', () => {
    it('offers their own space when files are dropped on the shared package, and uploads there only after they agree', async () => {
      await dropping(fileEntry('refused.pdf'));

      expect(server.begun).toEqual([]);

      await click(buttonNamed('Add to Your files'));

      expect(server.begun.map((upload) => upload.folderId)).toEqual([OWN]);
      expect(alerts()).toEqual(['The room is closed']);
    });

    it('says a finished upload was added, and refreshes the listing once', async () => {
      await openYourFiles();
      await dropping(fileEntry('application.pdf'), fileEntry('w9.pdf'));

      expect(uploadRows()).toEqual(['application.pdfAdded', 'w9.pdfAdded']);
      expect(server.refreshes).toBe(1);
    });

    it('uploads a dropped file that comes without a file system entry', async () => {
      await openYourFiles();

      const drop = new Event('drop', { bubbles: true });

      Object.assign(drop, {
        dataTransfer: {
          items: [
            {
              kind: 'file',
              webkitGetAsEntry: () => null,
              getAsFile: () => new File(['x'], 'emailed.pdf'),
            },
          ],
        },
      });

      await act(async () => {
        document.querySelector('[data-drop-zone]')!.dispatchEvent(drop);
      });
      await tick();

      expect(server.begun.map((upload) => upload.name)).toEqual([
        'emailed.pdf',
      ]);
    });

    it('says where a drop will land while files are dragged over the page', async () => {
      const zone = document.querySelector('[data-drop-zone]')!;
      const hint = () =>
        document.querySelector('[data-drop-hint]')?.textContent ?? null;

      await act(async () => {
        zone.dispatchEvent(dragEvent('dragover'));
      });

      expect(hint()).toBe('Drop to add to Your files');

      await act(async () => {
        zone.dispatchEvent(dragEvent('dragleave'));
      });

      expect(hint()).toBeNull();
    });

    it('starts four uploads at a time and shows the rest as queued until a slot frees', async () => {
      let openGate = () => {};

      server.storageGate = new Promise<void>((opened) => {
        openGate = opened;
      });
      await openYourFiles();
      await dropping(
        ...['1', '2', '3', '4', '5', '6'].map((n) => fileEntry(`${n}.pdf`)),
      );

      expect(server.begun).toHaveLength(4);
      expect(uploadRows().slice(4)).toEqual(['5.pdfQueued', '6.pdfQueued']);

      openGate();
      await tick();
      await tick();

      expect(uploadRows()).toEqual(
        ['1', '2', '3', '4', '5', '6'].map((n) => `${n}.pdfAdded`),
      );
    });
  });

  describe('zip files', () => {
    function zipRow(name: string) {
      return [...document.querySelectorAll('fieldset')].find(
        (row) =>
          row.querySelector('legend')!.textContent === `How to add ${name}`,
      )!;
    }

    function inZipRow(name: string, label: string) {
      return [...zipRow(name).querySelectorAll('label, button')].find(
        (control) => control.textContent === label,
      )!;
    }

    it('holds a dropped zip on its row with unpacking chosen, and adds it with one button', async () => {
      await openYourFiles();
      await dropping(fileEntry('forms.zip'));

      expect(server.registered).toEqual([]);
      expect(
        inZipRow('forms.zip', 'Unpack into a folder').querySelector('input')!
          .checked,
      ).toBe(true);

      await click(inZipRow('forms.zip', 'Add'));

      expect(server.registered).toEqual([
        { uploadId: 'upload:forms.zip', keepAsZip: false },
      ]);
      expect(uploadRows()).toEqual(['forms.zipAdded']);
    });

    it('gives each waiting zip its own choice and its own Add', async () => {
      await openYourFiles();
      await dropping(fileEntry('forms.zip'), fileEntry('statements.zip'));
      await click(inZipRow('statements.zip', 'Keep as one file'));
      await click(inZipRow('statements.zip', 'Add'));

      expect(server.registered).toEqual([
        { uploadId: 'upload:statements.zip', keepAsZip: true },
      ]);
      expect(zipRow('forms.zip')).toBeDefined();

      await click(inZipRow('forms.zip', 'Add'));

      expect(server.registered).toEqual([
        { uploadId: 'upload:statements.zip', keepAsZip: true },
        { uploadId: 'upload:forms.zip', keepAsZip: false },
      ]);
    });

    it('names a zip that could not be added and offers to try again', async () => {
      await openYourFiles();
      await dropping(fileEntry('crash.zip'));
      await click(inZipRow('crash.zip', 'Add'));

      expect(alerts()).toEqual(['crash.zip could not be uploaded. Try again.']);
      expect(buttonNamed('Try crash.zip again')).toBeDefined();
    });
  });

  describe('folders', () => {
    const forms = () =>
      folderEntry('Forms', [
        fileEntry('application.pdf'),
        fileEntry('.DS_Store'),
        folderEntry('Tax', [fileEntry('w9.pdf')]),
        folderEntry('.git', [fileEntry('index')]),
      ]);

    function begunByName() {
      return server.begun
        .map(({ name, folderId }) => ({ name, folderId }))
        .toSorted((a, b) => a.name.localeCompare(b.name));
    }

    it('recreates a dropped folder and uploads each file into its own folder, leaving out hidden files and what sits in a skipped directory', async () => {
      await openYourFiles();
      await dropping(forms());

      expect(server.trees).toEqual([
        {
          roomId: ROOM,
          parentFolderId: OWN,
          rootName: 'Forms',
          paths: ['.git', 'Tax'],
        },
      ]);
      expect(begunByName()).toEqual([
        { name: 'application.pdf', folderId: 'root-id' },
        { name: 'w9.pdf', folderId: 'tax-id' },
      ]);
      expect(uploadRows().toSorted()).toEqual([
        'application.pdfAdded',
        'w9.pdfAdded',
      ]);
      expect(alerts()).toEqual([]);
      expect(server.refreshes).toBe(1);
    });

    it('refreshes the listing for a dropped folder that holds no files', async () => {
      await openYourFiles();
      await dropping(folderEntry('Empty', []));

      expect(server.refreshes).toBe(1);
    });

    it('shows nothing for a folder the server skipped whole', async () => {
      await openYourFiles();
      await dropping(folderEntry('.Trash', [fileEntry('junk.pdf')]));

      expect(server.begun).toEqual([]);
      expect(alerts()).toEqual([]);
    });

    it('lists every refusal from one drop, uploads nothing from the refused folders, and carries on with the rest', async () => {
      await openYourFiles();
      await dropping(
        folderEntry('Huge', [fileEntry('inside.pdf')]),
        folderEntry('Expired', [fileEntry('late.pdf')]),
        fileEntry('cover-letter.pdf'),
      );

      expect(alerts()).toEqual([
        'Huge has too many folders to add',
        'Your session has ended. Sign in again.',
      ]);
      expect(
        document.querySelector('[role=alert] a')!.getAttribute('href'),
      ).toContain('/lender/sign-in');
      expect(begunByName()).toEqual([
        { name: 'cover-letter.pdf', folderId: OWN },
      ]);
    });

    it('names a folder that could not be created, does not try it again, and carries on with the rest', async () => {
      await openYourFiles();
      await dropping(
        folderEntry('Offline', [fileEntry('inside.pdf')]),
        forms(),
      );

      expect(alerts()).toEqual(['"Offline" could not be added. Try again.']);
      expect(server.trees.map((tree) => tree.rootName)).toEqual([
        'Offline',
        'Forms',
      ]);
      expect(begunByName().map((upload) => upload.name)).toEqual([
        'application.pdf',
        'w9.pdf',
      ]);
    });

    it('adds nothing and says so when part of a drop cannot be read', async () => {
      await openYourFiles();
      await dropping(
        fileEntry('fine.pdf'),
        folderEntry('Forms', [unreadableEntry('locked.pdf')]),
      );

      expect(alerts()).toEqual([
        'Some of what you dropped could not be read, so nothing was added. Try again, or add the files directly.',
      ]);
      expect(server.begun).toEqual([]);
      expect(server.trees).toEqual([]);
    });

    it('keeps a recording refusal on screen beside a refusal from a drop', async () => {
      server.recordingRefusal = 'This room has closed';
      await openYourFiles();
      await dropping(folderEntry('Huge', [fileEntry('inside.pdf')]));

      expect(alerts()).toEqual([
        'This room has closed',
        'Huge has too many folders to add',
      ]);
    });

    it('offers their own space when a folder is dropped on the shared package', async () => {
      await dropping(forms());

      expect(server.trees).toEqual([]);

      await click(buttonNamed('Add to Your files'));
      await tick();

      expect(server.trees).toMatchObject([{ parentFolderId: OWN }]);
    });

    async function nameNewFolder(name: string) {
      await click(buttonNamed('New folder'));

      const field = document.querySelector<HTMLInputElement>(
        '[role=dialog] input[name=name]',
      )!;

      await typeInto(field, name);
      await act(async () => field.form!.requestSubmit());
    }

    it('does not offer a new folder while the shared package is open', () => {
      expect(buttonNamed('New folder')).toBeUndefined();
    });

    it('invites a new folder from the empty state of their own space', async () => {
      await openYourFiles();

      const invitation = document.querySelector('[data-empty]')!;

      expect(invitation.textContent).toBe(
        'Drop your forms or files hereNew folder',
      );

      await click(invitation.querySelector('button')!);

      expect(
        document.querySelector('[role=dialog] input[name=name]'),
      ).not.toBeNull();
    });

    it('creates a folder in the folder that is open and stays where the person is', async () => {
      await openYourFiles();
      await nameNewFolder('Forms');

      expect(server.foldersCreated).toEqual([
        { roomId: ROOM, parentFolderId: OWN, name: 'Forms' },
      ]);
      expect(document.querySelector('[role=dialog]')).toBeNull();
      expect(server.refreshes).toBe(1);
      expect(breadcrumb()).toEqual(['Your files']);
    });

    it('shows the refusal beside the name and keeps the dialog open', async () => {
      await openYourFiles();
      await nameNewFolder('Taken');

      expect(
        document.querySelector('[role=dialog] [role=alert]')?.textContent,
      ).toBe('A folder named Taken is already here');
      expect(server.refreshes).toBe(0);
    });
  });

  describe('leaving with uploads unfinished', () => {
    const stopsLeaving = () =>
      !window.dispatchEvent(new Event('beforeunload', { cancelable: true }));

    function holdStorage() {
      let openGate = () => {};

      server.storageGate = new Promise<void>((opened) => {
        openGate = opened;
      });

      return openGate;
    }

    it('warns before leaving only while an upload is queued or in progress', async () => {
      expect(stopsLeaving()).toBe(false);

      const openGate = holdStorage();

      await openYourFiles();
      await dropping(fileEntry('application.pdf'));

      expect(stopsLeaving()).toBe(true);

      openGate();
      await tick();

      expect(stopsLeaving()).toBe(false);
    });

    it('remembers an upload until it finishes', async () => {
      const openGate = holdStorage();

      await openYourFiles();
      await dropping(fileEntry('application.pdf'));

      expect(
        server.unfinished.map(({ roomId, userId, name, folderId }) => ({
          roomId,
          userId,
          name,
          folderId,
        })),
      ).toEqual([
        { roomId: ROOM, userId: ANA, name: 'application.pdf', folderId: OWN },
      ]);

      openGate();
      await tick();
      await tick();

      expect(server.unfinished).toEqual([]);
    });

    it('forgets an upload the server refused and one the person removed', async () => {
      await openYourFiles();
      await dropping(fileEntry('refused.pdf'), fileEntry('forms.zip'));
      await tick();

      expect(server.unfinished.map((upload) => upload.name)).toEqual([
        'forms.zip',
      ]);

      await click(buttonNamed('Remove forms.zip'));
      await tick();

      expect(server.unfinished).toEqual([]);
      expect(server.cancelled).toEqual(['upload:forms.zip']);
    });

    function leftBehind(
      name: string,
      rest: Partial<UnfinishedUpload> = {},
    ): UnfinishedUpload {
      return {
        id: `${ROOM}/${ANA}/${name}`,
        roomId: ROOM,
        userId: ANA,
        name,
        folderId: OWN,
        uploadId: null,
        file: new File(['x'], name),
        savedAt: new Date().toISOString(),
        ...rest,
      };
    }

    it('asks on return whether to continue, and continues into the folders the files were headed for', async () => {
      server.unfinished = [
        leftBehind('application.pdf', { folderId: 'own-forms' }),
        leftBehind('forms.zip', { uploadId: 'stale-upload' }),
      ];
      await showAgain({
        shared,
        own: {
          ...own,
          folders: [{ id: 'own-forms', name: 'Forms', folders: [], entries: [] }],
        },
      });

      expect(dialogText()).toContain(
        'You have 2 uploads that did not finish. Continue uploading?',
      );
      expect(server.begun).toEqual([]);

      await click(buttonNamed('Continue'));
      await tick();
      await tick();

      expect(
        server.begun.map(({ name, folderId }) => ({ name, folderId })),
      ).toEqual([
        { name: 'application.pdf', folderId: 'own-forms' },
        { name: 'forms.zip', folderId: OWN },
      ]);
      expect(server.cancelled).toEqual(['stale-upload']);
      expect(
        [...document.querySelectorAll('fieldset legend')].map(
          (legend) => legend.textContent,
        ),
      ).toEqual(['How to add forms.zip']);
      expect(server.unfinished.map((upload) => upload.name)).toEqual([
        'forms.zip',
      ]);
    });

    it('forgets everything when the person discards', async () => {
      server.unfinished = [
        leftBehind('application.pdf', { uploadId: 'stale-upload' }),
      ];
      await showAgain();
      await click(buttonNamed('Discard'));
      await tick();

      expect(server.begun).toEqual([]);
      expect(server.unfinished).toEqual([]);
      expect(server.cancelled).toEqual(['stale-upload']);
      expect(dialogText()).toBeNull();
    });

    it('shows nothing to another person, or to the same person in another room', async () => {
      server.unfinished = [
        leftBehind('application.pdf'),
        leftBehind('other-room.pdf', { roomId: 'another-room' }),
      ];
      await showAgain(undefined, 'user-ben');

      expect(dialogText()).toBeNull();
      expect(server.unfinished).toHaveLength(2);
    });

    it('names the files the browser could not keep, so they can be added again', async () => {
      server.browserKeepsFiles = false;
      holdStorage();
      await openYourFiles();
      await dropping(fileEntry('huge.pdf'));

      expect(server.begun.map((upload) => upload.name)).toEqual(['huge.pdf']);

      await showAgain();

      expect(dialogText()).toContain(
        'These did not finish and need to be added again: huge.pdf.',
      );
      expect(buttonNamed('Continue')).toBeUndefined();

      await click(buttonNamed('OK'));
      await tick();

      expect(server.unfinished).toEqual([]);
    });

    it('asks again next visit when the prompt is dismissed rather than answered', async () => {
      server.unfinished = [leftBehind('application.pdf')];
      await showAgain();
      await press('Escape');
      await tick();

      expect(dialogText()).toBeNull();
      expect(server.unfinished).toHaveLength(1);

      await showAgain();

      expect(dialogText()).toContain('Continue uploading?');
    });

    it('sends a file whose folder is gone to the top of their own files, and says so once the uploads start', async () => {
      server.unfinished = [leftBehind('w9.pdf', { folderId: 'deleted-folder' })];
      await showAgain();
      await click(buttonNamed('Continue'));
      await tick();
      await tick();

      expect(server.begun).toMatchObject([{ name: 'w9.pdf', folderId: OWN }]);
      expect(document.body.textContent).toContain(
        'Some files went to Your files because their folder is gone',
      );
    });

    it('offers nothing another tab is still sending', async () => {
      server.unfinished = [leftBehind('application.pdf')];
      server.sentElsewhere = [lockName(leftBehind('application.pdf').id)];
      await showAgain();

      expect(dialogText()).toBeNull();
    });

    it('closes the prompt when another tab answers it, and tells other tabs when this one does', async () => {
      server.unfinished = [leftBehind('application.pdf')];
      await showAgain();

      expect(dialogText()).toContain('Continue uploading?');

      server.unfinished = [];
      await act(async () => server.answeredElsewhere.at(-1)!());
      await tick();

      expect(dialogText()).toBeNull();

      server.unfinished = [leftBehind('other.pdf')];
      await showAgain();
      await click(buttonNamed('Discard'));

      await tick();

      expect(server.answersAnnounced).toEqual([
        `${ROOM}/${ANA} with 0 still remembered`,
      ]);
    });

    it('remembers nothing and reloads when someone else signed in from another tab', async () => {
      server.sessionUserId = 'user-ben';
      await openYourFiles();
      await dropping(fileEntry('application.pdf'));

      expect(server.unfinished).toEqual([]);
      expect(server.begun).toEqual([]);
      expect(server.reloads).toBe(1);
    });

    it('restores nothing and reloads when someone else is signed in at the moment of continuing', async () => {
      server.unfinished = [leftBehind('application.pdf')];
      await showAgain();
      server.sessionUserId = 'user-ben';
      await click(buttonNamed('Continue'));
      await tick();

      expect(server.begun).toEqual([]);
      expect(server.reloads).toBe(1);
    });

    it('reloads when the signed-in person changes', async () => {
      await act(async () =>
        server.authListener!('SIGNED_IN', { user: { id: 'user-ben' } }),
      );

      expect(server.reloads).toBe(1);
    });

    it('forgets everything this person left in this browser when they sign out', async () => {
      server.unfinished = [
        leftBehind('here.pdf'),
        leftBehind('elsewhere.pdf', { roomId: 'another-room' }),
        leftBehind('bens.pdf', { userId: 'user-ben' }),
      ];
      await act(async () => server.authListener!('SIGNED_OUT', null));
      await tick();

      expect(server.unfinished.map((upload) => upload.name)).toEqual([
        'bens.pdf',
      ]);
      expect(server.reloads).toBe(1);
    });
  });

  describe('kept apart per person and room', () => {
    it('keeps the grid or list choice and the sort for this person in this room only', async () => {
      await click(buttonNamed('Grid view'));
      await showAgain(undefined, 'user-ben');

      expect(document.querySelector('[data-columns]')).not.toBeNull();

      await showAgain();

      expect(document.querySelector('[data-columns]')).toBeNull();
    });
  });

  describe('problems from drops', () => {
    it('keeps the refusals from each drop until the person dismisses them', async () => {
      await openYourFiles();
      await dropping(folderEntry('Huge', [fileEntry('inside.pdf')]));
      await dropping(fileEntry('fine.pdf'));

      expect(alerts()).toEqual(['Huge has too many folders to add']);

      await dropping(folderEntry('Expired', [fileEntry('late.pdf')]));

      expect(alerts()).toEqual([
        'Huge has too many folders to add',
        'Your session has ended. Sign in again.',
      ]);

      await click(buttonNamed('Dismiss: Huge has too many folders to add'));

      expect(alerts()).toEqual(['Your session has ended. Sign in again.']);
    });
  });

  describe('downloading empty folders', () => {
    it('offers no download when the selection holds no files', async () => {
      await click(buttonNamed('Select folder Environmental'));

      expect(buttonNamed('Download selected').disabled).toBe(true);
    });
  });
});
