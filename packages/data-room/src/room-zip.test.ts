import { describe, expect, it } from 'vitest';

import { readZipRequest, zipEntryPaths } from './room-zip';

const folders = [
  { id: 'root', parent_id: null, name: 'Package' },
  { id: 'fin', parent_id: 'root', name: 'Financials' },
  { id: 'odd', parent_id: 'root', name: '../a/b' },
];

function document(id: string, folderId: string, name: string) {
  return { id, folder_id: folderId, name, storage_path: `deal/d/${id}` };
}

describe('zipEntryPaths', () => {
  it('names each entry by its folders under the room roots, in the order asked', () => {
    expect(
      zipEntryPaths({
        documentIds: ['2', '1'],
        documents: [document('1', 'fin', 'p-and-l.pdf'), document('2', 'root', 'lease.pdf')],
        folders,
        roots: ['root'],
      }),
    ).toEqual([
      { storagePath: 'deal/d/2', path: 'Package/lease.pdf' },
      { storagePath: 'deal/d/1', path: 'Package/Financials/p-and-l.pdf' },
    ]);
  });

  it('numbers files that would share a path', () => {
    expect(
      zipEntryPaths({
        documentIds: ['1', '2'],
        documents: [document('1', 'fin', 'a.pdf'), document('2', 'fin', 'a.pdf')],
        folders,
        roots: ['root'],
      }).map((entry) => entry.path),
    ).toEqual(['Package/Financials/a.pdf', 'Package/Financials/a (2).pdf']);
  });

  it('never lets a name climb out of its folder', () => {
    expect(
      zipEntryPaths({
        documentIds: ['1'],
        documents: [document('1', 'odd', '..')],
        folders,
        roots: ['root'],
      }).map((entry) => entry.path),
    ).toEqual(['Package/.._a_b']);
  });
});

describe('readZipRequest', () => {
  const id = '0b6c1f2e-8a43-4c1d-9a7e-2f5d3c4b1a90';

  function post(headers: Record<string, string>, body?: FormData) {
    return new Request('http://app.test/rooms/r/files/zip', {
      method: 'POST',
      headers,
      body,
    });
  }

  it('refuses a request from another site', async () => {
    const result = await readZipRequest(post({ host: 'app.test', origin: 'https://evil.test' }));

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  it('reads the chosen document ids from a same-site form post', async () => {
    const form = new FormData();
    form.append('documentIds', id);

    expect(
      await readZipRequest(post({ host: 'app.test', origin: 'http://app.test' }, form)),
    ).toEqual({ documentIds: [id] });
  });
});
