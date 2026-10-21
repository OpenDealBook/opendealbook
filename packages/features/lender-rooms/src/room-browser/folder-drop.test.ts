import { describe, expect, it } from 'vitest';

import { fileTargets, folderDrops } from './folder-drop';

const file = (name: string) => new File(['x'], name);

describe('folderDrops', () => {
  const application = file('application.pdf');
  const w9 = file('w9.pdf');
  const y2024 = file('2024.pdf');
  const loose = file('cover-letter.pdf');
  const rateSheet = file('rate-sheet.xlsx');

  const dropped = folderDrops([
    { rootName: 'Forms', beneath: [], file: null },
    { rootName: 'Forms', beneath: ['application.pdf'], file: application },
    { rootName: 'Forms', beneath: ['Tax'], file: null },
    { rootName: 'Forms', beneath: ['Tax', 'Returns'], file: null },
    { rootName: 'Forms', beneath: ['Tax', 'Returns', '2024.pdf'], file: y2024 },
    { rootName: 'Forms', beneath: ['Tax', 'w9.pdf'], file: w9 },
    { rootName: 'Forms', beneath: ['Empty'], file: null },
    { rootName: 'cover-letter.pdf', beneath: [], file: loose },
    { rootName: 'Rates', beneath: [], file: null },
    { rootName: 'Rates', beneath: ['rate-sheet.xlsx'], file: rateSheet },
  ]);

  it('leaves out dot-files inside a dropped folder, at any depth', () => {
    const kept = file('kept.pdf');
    const { folders } = folderDrops([
      { rootName: 'Forms', beneath: [], file: null },
      { rootName: 'Forms', beneath: ['.DS_Store'], file: file('.DS_Store') },
      { rootName: 'Forms', beneath: ['Tax'], file: null },
      {
        rootName: 'Forms',
        beneath: ['Tax', '.DS_Store'],
        file: file('.DS_Store'),
      },
      { rootName: 'Forms', beneath: ['Tax', 'kept.pdf'], file: kept },
    ]);

    expect(folders[0]!.files).toEqual([{ file: kept, directory: 'Tax' }]);
  });

  it('keeps a dot-file dropped on its own, for the server to refuse', () => {
    const dotFile = file('.DS_Store');

    expect(
      folderDrops([{ rootName: '.DS_Store', beneath: [], file: dotFile }])
        .looseFiles,
    ).toEqual([dotFile]);
  });

  it('keeps files dropped on their own apart from the folders', () => {
    expect(dropped.looseFiles).toEqual([loose]);
  });

  it('describes each top-level folder once, in the order dropped', () => {
    expect(dropped.folders.map((folder) => folder.rootName)).toEqual([
      'Forms',
      'Rates',
    ]);
  });

  it('lists every directory beneath the root by its relative path, empty ones included, parents first', () => {
    expect(dropped.folders[0]!.paths).toEqual(['Empty', 'Tax', 'Tax/Returns']);
    expect(dropped.folders[1]!.paths).toEqual([]);
  });

  it('gives each file the relative directory it sits in, with the root as the empty path', () => {
    expect(dropped.folders[0]!.files).toEqual([
      { file: application, directory: '' },
      { file: y2024, directory: 'Tax/Returns' },
      { file: w9, directory: 'Tax' },
    ]);
  });
});

describe('fileTargets', () => {
  const application = file('application.pdf');
  const w9 = file('w9.pdf');
  const cache = file('index');

  const drop = {
    rootName: 'Forms',
    paths: ['.git', 'Tax'],
    files: [
      { file: application, directory: '' },
      { file: w9, directory: 'Tax' },
      { file: cache, directory: '.git' },
    ],
  };

  it('sends each file to the folder created for its directory', () => {
    expect(
      fileTargets(drop, {
        rootFolderId: 'root-id',
        folderIds: { Tax: 'tax-id' },
      }).slice(0, 2),
    ).toEqual([
      { file: application, folderId: 'root-id' },
      { file: w9, folderId: 'tax-id' },
    ]);
  });

  it('sends nothing when the server skipped the whole folder', () => {
    expect(fileTargets(drop, { rootFolderId: null, folderIds: {} })).toEqual(
      [],
    );
  });

  it('leaves out files whose directory the server skipped', () => {
    expect(
      fileTargets(drop, {
        rootFolderId: 'root-id',
        folderIds: { Tax: 'tax-id' },
      }).map((target) => target.file),
    ).toEqual([application, w9]);
  });
});
