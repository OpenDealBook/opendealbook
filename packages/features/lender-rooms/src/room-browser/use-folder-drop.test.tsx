// @vitest-environment jsdom
import { act, type DragEvent } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({ trees: [] as { rootName: string }[] }));

vi.mock('../uploads/folder-actions', () => ({
  createFolderTree: async (input: { rootName: string }) => {
    server.trees.push(input);

    if (input.rootName === 'Offline') {
      throw new Error('fetch failed');
    }

    return {
      ok: true,
      value: {
        rootFolderId: `${input.rootName}-id`,
        folderIds: { Tax: 'tax-id' },
      },
    };
  },
}));

import { useFolderDrop } from './use-folder-drop';

const ROOM = '7d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';
const DEAL = '3db2aa65-c72b-4a8a-8e44-55078ef249d4';
const PARENT = '0a2c7b8e-41d7-4b4e-8f39-6b2f7a0a2b22';

const fileEntry = (name: string, isReadable = true) => ({
  isFile: true,
  isDirectory: false,
  name,
  file: (found: (file: File) => void, failed: (error: Error) => void) =>
    isReadable ? found(new File(['x'], name)) : failed(new Error('gone')),
});

const folderEntry = (name: string, children: unknown[]) => ({
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
});

describe('useFolderDrop', () => {
  let container: HTMLDivElement;
  let root: Root;
  let started: { name: string; into: string }[];
  let foldersCreated: number;

  function Harness({
    space = { roomId: ROOM },
  }: {
    space?: { roomId: string } | { dealId: string };
  }) {
    const drop = useFolderDrop({
      space,
      startUploads: (files, into) =>
        started.push(...files.map((file) => ({ name: file.name, into }))),
      onFoldersCreated: (count) => {
        foldersCreated += count;
      },
    });

    return (
      <div
        data-zone
        onDrop={(event: DragEvent) => drop.dropInto(event, PARENT)}
      >
        {drop.problems.map((problem) => (
          <p key={problem.id} role={'alert'}>
            {problem.text}
          </p>
        ))}
      </div>
    );
  }

  async function drop(...entries: unknown[]) {
    const event = new Event('drop', { bubbles: true });

    Object.assign(event, {
      dataTransfer: {
        items: entries.map((entry) => ({
          kind: 'file',
          webkitGetAsEntry: () => entry,
        })),
      },
    });

    await act(async () => {
      container.querySelector('[data-zone]')!.dispatchEvent(event);
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  }

  const problems = () =>
    [...container.querySelectorAll('[role=alert]')].map((p) => p.textContent);

  beforeEach(() => {
    server.trees = [];
    started = [];
    foldersCreated = 0;
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<Harness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('creates one tree per dropped folder and starts each file in its folder, skipping hidden files', async () => {
    await drop(
      folderEntry('Forms', [
        fileEntry('application.pdf'),
        fileEntry('.DS_Store'),
        folderEntry('Tax', [fileEntry('w9.pdf')]),
      ]),
      fileEntry('cover-letter.pdf'),
    );

    expect(server.trees).toEqual([
      {
        roomId: ROOM,
        parentFolderId: PARENT,
        rootName: 'Forms',
        paths: ['Tax'],
      },
    ]);
    expect(started).toEqual([
      { name: 'cover-letter.pdf', into: PARENT },
      { name: 'application.pdf', into: 'Forms-id' },
      { name: 'w9.pdf', into: 'tax-id' },
    ]);
    expect(foldersCreated).toBe(1);
    expect(problems()).toEqual([]);
  });

  it('starts nothing and says so when part of the drop cannot be read', async () => {
    await drop(fileEntry('fine.pdf'), fileEntry('locked.pdf', false));

    expect(started).toEqual([]);
    expect(problems()).toEqual([
      'Some of what you dropped could not be read, so nothing was added. Try again, or add the files directly.',
    ]);
  });

  it('names a folder that could not be created, tries it once, and carries on', async () => {
    await drop(
      folderEntry('Offline', [fileEntry('lost.pdf')]),
      folderEntry('Rates', [fileEntry('rates.pdf')]),
    );

    expect(server.trees.map((tree) => tree.rootName)).toEqual([
      'Offline',
      'Rates',
    ]);
    expect(started).toEqual([{ name: 'rates.pdf', into: 'Rates-id' }]);
    expect(problems()).toEqual(['"Offline" could not be added. Try again.']);
  });

  it('ignores dropped text that is not a file', async () => {
    const event = new Event('drop', { bubbles: true });

    Object.assign(event, {
      dataTransfer: {
        items: [
          {
            kind: 'string',
            webkitGetAsEntry: () => null,
            getAsFile: () => null,
          },
        ],
      },
    });

    await act(async () => {
      container.querySelector('[data-zone]')!.dispatchEvent(event);
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(started).toEqual([]);
    expect(problems()).toEqual([]);
  });

  it('creates the tree in the shared package when dropped there by the deal team', async () => {
    act(() => root.render(<Harness space={{ dealId: DEAL }} />));
    await drop(folderEntry('Forms', [fileEntry('application.pdf')]));

    expect(server.trees).toEqual([
      { dealId: DEAL, parentFolderId: PARENT, rootName: 'Forms', paths: [] },
    ]);
    expect(started).toEqual([{ name: 'application.pdf', into: 'Forms-id' }]);
  });
});
