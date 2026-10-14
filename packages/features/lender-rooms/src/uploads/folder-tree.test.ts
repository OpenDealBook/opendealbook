import { describe, expect, it } from 'vitest';

import { isUsableFolderName, planFolderTree } from './folder-tree';

function planAtRoomRoot(rootName: string, paths: string[]) {
  return planFolderTree(rootName, paths, 0);
}

function planned(rootName: string, paths: string[], parentLevel = 0) {
  const plan = planFolderTree(rootName, paths, parentLevel);

  if (plan.kind !== 'planned') {
    throw new Error(`expected a planned tree, got ${plan.kind}`);
  }

  return plan;
}

describe('isUsableFolderName', () => {
  it('accepts an ordinary name', () => {
    expect(isUsableFolderName('Tax returns 2024')).toBe(true);
  });

  it('refuses a name starting with a dot', () => {
    expect(isUsableFolderName('.hidden')).toBe(false);
  });
});

describe('planFolderTree', () => {
  it('lists each directory once, parents before children, whatever order and repeats the page sent', () => {
    expect(
      planned('Drop', ['tax/2024', 'legal', 'tax', 'tax/2024']).directories,
    ).toEqual(['tax', 'tax/2024', 'legal']);
  });

  it('treats paths that differ only by case as one folder, keeping the first spelling and keying every path sent', () => {
    const plan = planned('Drop', ['Tax/2024', 'tax/Q1', 'TAX']);

    expect(plan.directories).toEqual(['Tax', 'Tax/2024', 'tax/Q1']);
    expect([...plan.keyedPaths.keys()]).toEqual([
      'Tax/2024',
      'tax/Q1',
      'TAX',
      'Tax',
    ]);
  });

  it('trims whitespace around each segment, keyed by the path as sent and by each trimmed directory', () => {
    const plan = planned('Drop', [' tax / 2024 ']);

    expect(plan.directories).toEqual(['tax', 'tax/2024']);
    expect([...plan.keyedPaths]).toEqual([
      [' tax / 2024 ', 'tax/2024'],
      ['tax', 'tax'],
      ['tax/2024', 'tax/2024'],
    ]);
  });

  it('skips a directory whose name starts with a dot, with everything beneath it', () => {
    const plan = planned('Repo', ['src', '.git', '.git/hooks', 'src/.cache/x']);

    expect(plan.directories).toEqual(['src']);
    expect([...plan.keyedPaths.keys()]).toEqual(['src']);
  });

  it('skips a macOS resource directory, with everything beneath it', () => {
    expect(
      planned('Mac', ['docs', '__MACOSX', '__MACOSX/docs']).directories,
    ).toEqual(['docs']);
  });

  it.each([['.hidden'], ['__MACOSX']])(
    'skips the whole drop when the dropped folder itself is %s',
    (rootName) => {
      expect(planAtRoomRoot(rootName, ['tax'])).toEqual({ kind: 'skipped' });
    },
  );

  it.each([
    ['an empty segment', 'tax//2024'],
    ['a segment of only spaces', 'tax/  /2024'],
    ['a leading slash', '/tax'],
    ['a . segment', 'tax/./2024'],
    ['a .. segment', 'tax/../../other'],
    ['a drive segment', 'c:/tax'],
    ['a segment with a backslash', 'tax\\2024'],
    ['a segment longer than 255 characters', `tax/${'a'.repeat(256)}`],
  ])('refuses the whole tree as unusable for %s', (_, path) => {
    expect(planAtRoomRoot('Drop', ['fine', path])).toEqual({
      kind: 'refused',
      reason: 'unusable',
    });
  });

  it('refuses a root name that cannot be used', () => {
    expect(planAtRoomRoot('a/b', ['tax'])).toEqual({
      kind: 'refused',
      reason: 'unusable',
    });
  });

  it('accepts a tree whose deepest folder sits 20 levels below the room folder', () => {
    expect(
      planned('Drop', [Array(19).fill('d').join('/')]).directories,
    ).toHaveLength(19);
  });

  it('refuses a tree whose deepest folder would sit 21 levels below the room folder', () => {
    expect(planAtRoomRoot('Drop', [Array(20).fill('d').join('/')])).toEqual({
      kind: 'refused',
      reason: 'too-deep',
    });
  });

  it('counts the level of the folder the tree is dropped into', () => {
    expect(planned('Drop', ['a'], 18).directories).toEqual(['a']);
    expect(planFolderTree('Drop', ['a'], 19)).toEqual({
      kind: 'refused',
      reason: 'too-deep',
    });
  });

  it('refuses even an empty tree dropped into a folder already 20 levels down', () => {
    expect(planFolderTree('Drop', [], 20)).toEqual({
      kind: 'refused',
      reason: 'too-deep',
    });
  });

  it('accepts exactly 2,000 folders counting the root', () => {
    expect(
      planned(
        'Drop',
        Array.from({ length: 1999 }, (_, index) => `d${index}`),
      ).directories,
    ).toHaveLength(1999);
  });

  it('refuses more than 2,000 folders counting the root as too many', () => {
    expect(
      planAtRoomRoot(
        'Drop',
        Array.from({ length: 2000 }, (_, index) => `d${index}`),
      ),
    ).toEqual({ kind: 'refused', reason: 'too-many' });
  });

  it('counts paths that differ only by case once toward the limit', () => {
    const lower = Array.from({ length: 1999 }, (_, index) => `d${index}`);
    const upper = lower.map((path) => path.toUpperCase());

    expect(planned('Drop', [...lower, ...upper]).directories).toHaveLength(
      1999,
    );
  });
});
