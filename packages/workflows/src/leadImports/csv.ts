import { Unzip, UnzipInflate } from 'fflate';
import Papa from 'papaparse';

import { PassThrough, pipeline, type Readable, Transform } from 'node:stream';

export async function* csvRecords(
  stream: Readable,
  columns: string[],
): AsyncGenerator<Record<string, string>> {
  const header: string[] = [];
  let checked = false;
  const checkHeader = () => {
    const missing = columns.find((column) => !header.includes(column));
    if (missing !== undefined) throw new Error(`Missing column ${missing}`);
    checked = true;
  };

  const records: AsyncIterable<Record<string, string>> = pipeline(
    stream,
    utf8OrWindows1252(),
    Papa.parse(Papa.NODE_STREAM_INPUT, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (name) => {
        header.push(name.trim());
        return name.trim();
      },
    }),
    () => {},
  );
  for await (const record of records) {
    if (!checked) checkHeader();
    yield record;
  }
  if (!checked) checkHeader();
}

function completeUtf8Length(bytes: Buffer): number {
  for (let back = 1; back <= Math.min(3, bytes.length); back += 1) {
    const byte = bytes[bytes.length - back]!;
    if ((byte & 0xc0) === 0x80) continue;
    const needed = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1;
    return needed > back ? bytes.length - back : bytes.length;
  }
  return bytes.length;
}

function utf8OrWindows1252(): Transform {
  let encoding: 'utf-8' | 'windows-1252' = 'utf-8';
  let carry = Buffer.alloc(0);

  return new Transform({
    transform(chunk: Buffer, _encoding, done) {
      const bytes = Buffer.concat([carry, chunk]);
      carry = Buffer.alloc(0);
      if (encoding === 'utf-8') {
        const cut = completeUtf8Length(bytes);
        try {
          const text = new TextDecoder('utf-8', { fatal: true }).decode(
            bytes.subarray(0, cut),
          );
          carry = bytes.subarray(cut);
          done(null, text);
          return;
        } catch {
          encoding = 'windows-1252';
        }
      }
      done(null, new TextDecoder('windows-1252').decode(bytes));
    },
    flush(done) {
      done(
        null,
        carry.length > 0
          ? new TextDecoder('windows-1252').decode(carry)
          : undefined,
      );
    },
  });
}

export function firstZipEntry(zip: Readable): Readable {
  const entryStream = new PassThrough();
  let started = false;
  const fail = (error: Error) => {
    zip.destroy();
    entryStream.destroy(error);
  };

  const unzip = new Unzip((entry) => {
    if (started) return;
    started = true;
    if (entry.compression !== 0 && entry.compression !== 8) {
      fail(new Error(`Unsupported zip compression ${entry.compression}`));
      return;
    }
    entry.ondata = (error, data, final) => {
      if (error) {
        fail(error);
        return;
      }
      if (!entryStream.write(data)) {
        zip.pause();
        entryStream.once('drain', () => zip.resume());
      }
      if (final) entryStream.end();
    };
    entry.start();
  });
  unzip.register(UnzipInflate);

  const push = (chunk: Uint8Array, final: boolean) => {
    try {
      unzip.push(chunk, final);
    } catch (error) {
      fail(error as Error);
    }
  };
  zip.on('data', (chunk: Buffer) => push(chunk, false));
  zip.on('end', () => push(new Uint8Array(0), true));
  zip.on('error', (error) => entryStream.destroy(error));
  return entryStream;
}
