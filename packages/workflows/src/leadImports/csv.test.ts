import { describe, expect, it } from 'vitest';

import { csvRecords, firstZipEntry } from './csv';

import { readFileSync } from 'node:fs';
import { PassThrough, Readable } from 'node:stream';

async function collect(records: AsyncIterable<Record<string, string>>) {
  const all: Record<string, string>[] = [];
  for await (const record of records) all.push(record);
  return all;
}

async function drain(stream: Readable) {
  for await (const _chunk of stream);
}

describe('csvRecords', () => {
  it('decodes a file that ends partway through a UTF-8 sequence as Windows-1252', async () => {
    const bytes = Buffer.concat([
      Buffer.from('ACK_ID,NAME\nA1,CAF'),
      Buffer.from([0xc3]),
    ]);

    expect(await collect(csvRecords(Readable.from([bytes]), []))).toEqual([
      { ACK_ID: 'A1', NAME: 'CAFÃ' },
    ]);
  });

  it('decodes every Windows-1252 byte from 0x80 to 0x9F to its WHATWG code point', async () => {
    const block = Array.from({ length: 32 }, (_, index) => 0x80 + index);
    const bytes = Buffer.concat([Buffer.from('NAME\n'), Buffer.from(block)]);

    const [record] = await collect(csvRecords(Readable.from([bytes]), []));

    expect([...record!.NAME!].map((char) => char.codePointAt(0))).toEqual([
      0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6,
      0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f, 0x0090, 0x2018,
      0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161,
      0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
    ]);
  });
});

describe('csvRecords header check', () => {
  it('fails before yielding any row when a column it reads is missing', async () => {
    const rows: Record<string, string>[] = [];
    const reading = (async () => {
      for await (const record of csvRecords(
        Readable.from(['ACK_ID,NAME\nA1,ONE\n']),
        ['ACK_ID', 'EIN', 'NAME'],
      )) {
        rows.push(record);
      }
    })();

    await expect(reading).rejects.toThrow('Missing column EIN');
    expect(rows).toEqual([]);
  });

  it('fails a file that has a header and no rows when a column is missing', async () => {
    await expect(
      collect(csvRecords(Readable.from(['ACK_ID\n']), ['ACK_ID', 'NAME'])),
    ).rejects.toThrow('Missing column NAME');
  });
});

describe('firstZipEntry', () => {
  it('fails when the zipped entry is corrupt', async () => {
    const zip = readFileSync(
      new URL('./fixtures/form_5500_sf.zip', import.meta.url),
    );
    const nameLength = zip.readUInt16LE(26);
    const extraLength = zip.readUInt16LE(28);
    const corrupt = Buffer.from(zip);
    corrupt.fill(
      0xff,
      30 + nameLength + extraLength,
      30 + nameLength + extraLength + 8,
    );

    await expect(
      drain(firstZipEntry(Readable.from([corrupt]))),
    ).rejects.toThrow();
  });

  it('fails when the download stream fails', async () => {
    const source = new PassThrough();
    const entry = firstZipEntry(source);

    source.destroy(new Error('socket hang up'));

    await expect(drain(entry)).rejects.toThrow('socket hang up');
  });

  it('fails with an unsupported compression method instead of throwing out of the stream', async () => {
    const zip = Buffer.from(
      readFileSync(new URL('./fixtures/form_5500_sf.zip', import.meta.url)),
    );
    zip.writeUInt16LE(9, 8);

    await expect(drain(firstZipEntry(Readable.from([zip])))).rejects.toThrow(
      'Unsupported zip compression',
    );
  });
});

describe('csvRecords source failure', () => {
  it('rejects when the source fails partway through the file', async () => {
    const source = new PassThrough();
    const records = csvRecords(source, []);
    source.write('ACK_ID,NAME\nA1,ONE\n');

    await expect(records.next()).resolves.toMatchObject({
      value: { ACK_ID: 'A1' },
    });
    source.destroy(new Error('socket reset'));
    await expect(collect(records)).rejects.toThrow('socket reset');
  });
});
