import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { MAX_UPLOAD_BYTES } from './allowed';
import { planExpansion } from './plan';

const ENCRYPTED_DEFLATED_ZIP =
  'UEsDBAoACQAAAJ09TV2GphA2EQAAAAUAAAAJABwAc21hbGwudHh0VVQJAAO6Gc5quhnOanV4CwABBPUBAAAEAAAAAISbfn8vQPeFCvFWoo7kFZbKUEsHCIamEDYRAAAABQAAAFBLAwQUAAkACACdPU1dMYe9yjEAAAAgTgAABwAcAGJpZy50eHRVVAkAA7oZzmq6Gc5qdXgLAAEE9QEAAAQAAAAAJDy8uQUhlhxDw/RqqT9qv5Tbo8q0xcfv277eAeouzFYRNjApXgYyXc+SSNrhA3QIhlBLBwgxh73KMQAAACBOAABQSwECHgMKAAkAAACdPU1dhqYQNhEAAAAFAAAACQAYAAAAAAABAAAApIEAAAAAc21hbGwudHh0VVQFAAO6Gc5qdXgLAAEE9QEAAAQAAAAAUEsBAh4DFAAJAAgAnT1NXTGHvcoxAAAAIE4AAAcAGAAAAAAAAQAAAKSBZAAAAGJpZy50eHRVVAUAA7oZzmp1eAsAAQT1AQAABAAAAABQSwUGAAAAAAIAAgCcAAAA5gAAAAAA';

const ENCRYPTED_STORED_ZIP =
  'UEsDBAoACQAAAJ09TV2GphA2EQAAAAUAAAAJABwAc21hbGwudHh0VVQJAAO6Gc5quhnOanV4CwABBPUBAAAEAAAAAAfRQQAI/0S7nvyLXOMMnbupUEsHCIamEDYRAAAABQAAAFBLAQIeAwoACQAAAJ09TV2GphA2EQAAAAUAAAAJABgAAAAAAAAAAACkgQAAAABzbWFsbC50eHRVVAUAA7oZzmp1eAsAAQT1AQAABAAAAABQSwUGAAAAAAEAAQBPAAAAZAAAAAAA';

const NOT_A_ZIP = new Uint8Array(40).fill(7);

function fromBase64(encoded: string): Uint8Array {
  return Uint8Array.from(Buffer.from(encoded, 'base64'));
}

function declaringSizes(
  archive: Uint8Array,
  declaredBytes: number,
  onlyEntry?: string,
) {
  const view = new DataView(
    archive.buffer,
    archive.byteOffset,
    archive.byteLength,
  );

  for (let offset = 0; offset + 4 <= archive.byteLength; offset += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      continue;
    }

    const name = Buffer.from(
      archive.subarray(
        offset + 46,
        offset + 46 + view.getUint16(offset + 28, true),
      ),
    ).toString();

    if (onlyEntry === undefined || name === onlyEntry) {
      view.setUint32(offset + 24, declaredBytes, true);
    }
  }

  return archive;
}

function asZip64(archive: Uint8Array): Uint8Array {
  const end = archive.byteLength - 22;
  const original = new DataView(archive.buffer, archive.byteOffset);
  const result = new Uint8Array(archive.byteLength + 76);
  const view = new DataView(result.buffer);

  result.set(archive.subarray(0, end), 0);
  view.setUint32(end, 0x06064b50, true);
  view.setBigUint64(end + 4, 44n, true);
  view.setUint16(end + 12, 45, true);
  view.setUint16(end + 14, 45, true);
  view.setBigUint64(end + 24, BigInt(original.getUint16(end + 10, true)), true);
  view.setBigUint64(end + 32, BigInt(original.getUint16(end + 10, true)), true);
  view.setBigUint64(end + 40, BigInt(original.getUint32(end + 12, true)), true);
  view.setBigUint64(end + 48, BigInt(original.getUint32(end + 16, true)), true);
  view.setUint32(end + 56, 0x07064b50, true);
  view.setBigUint64(end + 64, BigInt(end), true);
  view.setUint32(end + 72, 1, true);
  result.set(archive.subarray(end), end + 76);
  view.setUint16(end + 76 + 8, 0xffff, true);
  view.setUint16(end + 76 + 10, 0xffff, true);
  view.setUint32(end + 76 + 16, 0xffffffff, true);

  return result;
}

function nestedZips(levels: number): Uint8Array {
  return levels === 1
    ? zipSync({ 'leaf.txt': strToU8('leaf') })
    : zipSync({ 'inner.zip': nestedZips(levels - 1) });
}

function planAtRoomRoot(archiveName: string, archive: Uint8Array) {
  return planExpansion(archiveName, archive, 0);
}

function placements(archiveName: string, archive: Uint8Array) {
  return planAtRoomRoot(archiveName, archive)?.documents.map((doc) => [
    doc.folder,
    doc.name,
  ]);
}

describe('planExpansion', () => {
  it('puts top-level entries in a folder named after the archive', () => {
    const bytes = strToU8('term sheet');

    expect(
      planAtRoomRoot('Lender Forms.zip', zipSync({ 'terms.pdf': bytes })),
    ).toEqual({
      folders: ['Lender Forms'],
      documents: [{ folder: 'Lender Forms', name: 'terms.pdf', bytes }],
      oversize: [],
    });
  });

  it('keeps internal directories as subfolders, parents before children', () => {
    const plan = planAtRoomRoot(
      'forms.zip',
      zipSync({
        'tax/2024/return.pdf': strToU8('a'),
        'tax/summary.pdf': strToU8('b'),
      }),
    );

    expect(plan?.folders).toEqual(['forms', 'forms/tax', 'forms/tax/2024']);
    expect(plan?.documents.map((doc) => [doc.folder, doc.name])).toEqual([
      ['forms/tax/2024', 'return.pdf'],
      ['forms/tax', 'summary.pdf'],
    ]);
  });

  it('expands a zip inside the archive into its own folder instead of keeping it as a file', () => {
    const plan = planAtRoomRoot(
      'outer.zip',
      zipSync({
        'sub/inner.zip': zipSync({
          'deep/note.txt': strToU8('n'),
          'innermost.zip': zipSync({ 'leaf.txt': strToU8('l') }),
        }),
      }),
    );

    expect(plan?.folders).toEqual([
      'outer',
      'outer/sub',
      'outer/sub/inner',
      'outer/sub/inner/deep',
      'outer/sub/inner/innermost',
    ]);
    expect(plan?.documents.map((doc) => [doc.folder, doc.name])).toEqual([
      ['outer/sub/inner/deep', 'note.txt'],
      ['outer/sub/inner/innermost', 'leaf.txt'],
    ]);
  });

  it('lists an entry over 300 MiB as an oversize placeholder instead of a document', () => {
    const started = performance.now();
    const plan = planAtRoomRoot(
      'media.zip',
      declaringSizes(
        zipSync({
          'cad/survey.dwg': strToU8('s'),
          'cad/legend.txt': strToU8('p'),
        }),
        MAX_UPLOAD_BYTES + 1,
        'cad/survey.dwg',
      ),
    );

    expect(plan?.oversize).toEqual([
      {
        folder: 'media/cad',
        name: 'survey.dwg',
        sizeBytes: MAX_UPLOAD_BYTES + 1,
      },
    ]);
    expect(plan?.documents.map((doc) => doc.name)).toEqual(['legend.txt']);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('keeps an entry of exactly 300 MiB by its declared size as a document', () => {
    const plan = planAtRoomRoot(
      'media.zip',
      declaringSizes(zipSync({ 'survey.dwg': strToU8('s') }), MAX_UPLOAD_BYTES),
    );

    expect(plan?.oversize).toEqual([]);
    expect(plan?.documents.map((doc) => doc.name)).toEqual(['survey.dwg']);
  });

  it('makes an empty folder for an empty archive', () => {
    expect(planAtRoomRoot('nothing.zip', zipSync({}))).toEqual({
      folders: ['nothing'],
      documents: [],
      oversize: [],
    });
  });

  it('drops leading slashes, drive prefixes, and dot segments from entry paths', () => {
    const plan = planAtRoomRoot(
      'odd.zip',
      zipSync({
        '/abs/a.txt': strToU8('a'),
        '../../up.txt': strToU8('b'),
        'C:/dir/./../c.txt': strToU8('c'),
      }),
    );

    expect(plan?.folders).toEqual(['odd', 'odd/abs', 'odd/dir']);
    expect(plan?.documents.map((doc) => [doc.folder, doc.name])).toEqual([
      ['odd/abs', 'a.txt'],
      ['odd', 'up.txt'],
      ['odd/dir', 'c.txt'],
    ]);
  });

  it('skips video and audio entries and records them nowhere', () => {
    expect(
      planAtRoomRoot(
        'visit.zip',
        zipSync({
          'media/tour.MOV': strToU8('v'),
          'media/call.mp3': strToU8('m'),
          'notes.txt': strToU8('n'),
        }),
      ),
    ).toEqual({
      folders: ['visit'],
      documents: [{ folder: 'visit', name: 'notes.txt', bytes: strToU8('n') }],
      oversize: [],
    });
  });

  it('skips entries whose final name cannot be used as a file name', () => {
    expect(
      placements(
        'names.zip',
        zipSync({
          'kept.txt': strToU8('k'),
          'dir/.zip': strToU8('e'),
          'win\\path.txt': strToU8('w'),
          [`${'a'.repeat(256)}.txt`]: strToU8('l'),
        }),
      ),
    ).toEqual([['names', 'kept.txt']]);
  });

  it('keeps an unreadable zip inside the archive as a file', () => {
    expect(
      placements('bundle.zip', zipSync({ 'broken.zip': NOT_A_ZIP })),
    ).toEqual([['bundle', 'broken.zip']]);
  });

  it('keeps a password-protected zip inside the archive as a file', () => {
    expect(
      placements(
        'bundle.zip',
        zipSync({ 'locked.zip': fromBase64(ENCRYPTED_STORED_ZIP) }),
      ),
    ).toEqual([['bundle', 'locked.zip']]);
  });

  it.each([
    ['bytes that are not a zip', NOT_A_ZIP],
    ['a password-protected zip', fromBase64(ENCRYPTED_DEFLATED_ZIP)],
    [
      'a password-protected zip whose entries are stored uncompressed',
      fromBase64(ENCRYPTED_STORED_ZIP),
    ],
  ])('does not expand %s', (_, archive) => {
    expect(planAtRoomRoot('upload.zip', archive)).toBeNull();
  });

  it('expands an archive whose files and folders together number exactly 2,000', () => {
    const files: Record<string, Uint8Array> = {};
    for (let index = 0; index < 1999; index += 1) {
      files[`f${index}.txt`] = strToU8('x');
    }

    expect(planAtRoomRoot('many.zip', zipSync(files))?.documents).toHaveLength(
      1999,
    );
  });

  it('does not expand an archive with more than 2,000 files and folders', () => {
    const files: Record<string, Uint8Array> = {};
    for (let index = 0; index < 1000; index += 1) {
      files[`d${index}/f.txt`] = strToU8('x');
    }

    expect(planAtRoomRoot('many.zip', zipSync(files))).toBeNull();
  });

  it('does not expand an archive whose entries, nested ones included, pass 2,000', () => {
    const files: Record<string, Uint8Array> = {};
    for (let index = 0; index < 1997; index += 1) {
      files[`f${index}.txt`] = strToU8('x');
    }
    files['more.zip'] = zipSync({ 'one.txt': strToU8('1') });

    expect(planAtRoomRoot('many.zip', zipSync(files))).toBeNull();
  });

  it('refuses a directory entry tens of thousands of levels deep without doing the work', () => {
    const archive = zipSync({ ['a/'.repeat(32_000)]: new Uint8Array(0) });
    const started = performance.now();

    expect(planAtRoomRoot('deep.zip', archive)).toBeNull();
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('expands an archive whose deepest folder sits 20 levels below the room folder', () => {
    expect(
      planAtRoomRoot(
        'levels.zip',
        zipSync({ [`${'d/'.repeat(19)}leaf.txt`]: strToU8('l') }),
      )?.documents,
    ).toHaveLength(1);
  });

  it('does not expand an archive whose deepest folder would sit 21 levels below the room folder', () => {
    expect(
      planAtRoomRoot(
        'levels.zip',
        zipSync({ [`${'d/'.repeat(20)}leaf.txt`]: strToU8('l') }),
      ),
    ).toBeNull();
  });

  it('counts the level of the folder the archive is expanded into', () => {
    const archive = zipSync({ 'sub/leaf.txt': strToU8('l') });

    expect(planExpansion('levels.zip', archive, 18)?.documents).toHaveLength(1);
    expect(planExpansion('levels.zip', archive, 19)).toBeNull();
  });

  it('counts the levels a nested zip adds', () => {
    const archive = zipSync({
      'inner.zip': zipSync({ 'leaf.txt': strToU8('l') }),
    });

    expect(planExpansion('outer.zip', archive, 18)?.documents).toHaveLength(1);
    expect(planExpansion('outer.zip', archive, 19)).toBeNull();
  });

  it('does not expand an archive into a folder already 20 levels down', () => {
    expect(
      planExpansion('flat.zip', zipSync({ 'a.txt': strToU8('a') }), 20),
    ).toBeNull();
  });

  it('does not expand an archive with a directory name that cannot be used as a name', () => {
    expect(
      planAtRoomRoot(
        'dirs.zip',
        zipSync({ 'bad\\dir/leaf.txt': strToU8('l') }),
      ),
    ).toBeNull();
  });

  it('skips everything under a directory whose name starts with a dot', () => {
    expect(
      planAtRoomRoot(
        'repo.zip',
        zipSync({
          'readme.txt': strToU8('r'),
          '.git/config': strToU8('c'),
          'src/.github/workflows/ci.txt': strToU8('w'),
        }),
      ),
    ).toEqual({
      folders: ['repo'],
      documents: [{ folder: 'repo', name: 'readme.txt', bytes: strToU8('r') }],
      oversize: [],
    });
  });

  it('does not expand a zip64 archive', () => {
    expect(
      planAtRoomRoot('big.zip', asZip64(zipSync({ 'a.txt': strToU8('a') }))),
    ).toBeNull();
  });

  it('skips macOS resource entries', () => {
    expect(
      planAtRoomRoot(
        'mac.zip',
        zipSync({
          'notes.txt': strToU8('n'),
          '._notes.txt': strToU8('r'),
          '__MACOSX/._notes.txt': strToU8('r'),
          '__MACOSX/sub/other.txt': strToU8('o'),
        }),
      ),
    ).toEqual({
      folders: ['mac'],
      documents: [{ folder: 'mac', name: 'notes.txt', bytes: strToU8('n') }],
      oversize: [],
    });
  });

  it('trims whitespace around an entry name', () => {
    expect(
      placements('spaced.zip', zipSync({ 'dir/ notes.txt ': strToU8('n') })),
    ).toEqual([['spaced/dir', 'notes.txt']]);
  });

  it('expands zips nested 3 deep', () => {
    expect(placements('one.zip', nestedZips(3))).toEqual([
      ['one/inner/inner', 'leaf.txt'],
    ]);
  });

  it('does not expand an archive nested more than 3 deep', () => {
    expect(planAtRoomRoot('one.zip', nestedZips(4))).toBeNull();
  });

  it('does not expand an archive holding a zip that declares more than 1 GiB', () => {
    const archive = declaringSizes(
      zipSync({ 'bomb.zip': strToU8('x') }),
      1024 ** 3 + 1,
    );

    expect(planAtRoomRoot('outer.zip', archive)).toBeNull();
  });

  it('does not expand an archive whose entries together pass 1 GiB', () => {
    const archive = declaringSizes(
      zipSync({
        'a.bin': strToU8('a'),
        'b.bin': strToU8('b'),
        'c.bin': strToU8('c'),
        'd.bin': strToU8('d'),
      }),
      290 * 1024 * 1024,
    );

    expect(planAtRoomRoot('bomb.zip', archive)).toBeNull();
  });

  it('never inflates an entry past the size the archive declares for it', () => {
    const archive = declaringSizes(
      zipSync({ 'liar.bin': new Uint8Array(5 * 1024 * 1024) }),
      10,
    );

    expect(
      planAtRoomRoot('liar.zip', archive)?.documents.map(
        (doc) => doc.bytes.length,
      ),
    ).toEqual([10]);
  });

  it('still drops a drive segment from an entry path', () => {
    expect(
      placements('win.zip', zipSync({ 'c:/docs/a.txt': strToU8('a') })),
    ).toEqual([['win/docs', 'a.txt']]);
  });
});
