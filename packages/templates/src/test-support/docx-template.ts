import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';

const BASE_TEMPLATE = fileURLToPath(
  new URL('../../fixtures/loi-standard.docx', import.meta.url),
);

function unzip(zip: Buffer): { name: string; data: Buffer }[] {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const entries = zip.readUInt16LE(end + 10);
  let cursor = zip.readUInt32LE(end + 16);
  const files: { name: string; data: Buffer }[] = [];

  for (let index = 0; index < entries; index++) {
    const method = zip.readUInt16LE(cursor + 10);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const name = zip.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    const dataStart =
      localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    const raw = zip.subarray(dataStart, dataStart + compressedSize);

    if (!name.endsWith('/')) {
      files.push({ name, data: method === 8 ? inflateRawSync(raw) : raw });
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return files;
}

export function zipDeflated(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nameBytes = Buffer.from(name);
    const packed = deflateRawSync(data);
    const checksum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + packed.length;
  }

  const centralBytes = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBytes, end]);
}

function mergeField(key: string, index: number): string {
  const tag = JSON.stringify({
    displayLabel: `{{${key}}}`,
    defaultDisplayLabel: `{{${key}}}`,
    fieldId: key,
    fieldType: 'TEXTINPUT',
    fieldTypeShort: 'text',
    fieldColor: '#980043',
  }).replaceAll('"', '&quot;');

  return `</w:t></w:r><w:sdt><w:sdtPr><w:alias w:val="{{${key}}}" /><w:tag w:val="${tag}" /><w:id w:val="${index + 1}" /></w:sdtPr><w:sdtContent><w:r><w:t>{{${key}}}</w:t></w:r></w:sdtContent></w:sdt><w:r><w:t xml:space="preserve">`;
}

export function templateDocument(paragraphs: string[]): Buffer {
  let fields = 0;
  const body = paragraphs
    .map(
      (text) =>
        `<w:p><w:r><w:t xml:space="preserve">${text.replaceAll(/\{\{(\w+)\}\}/g, (_, key: string) => mergeField(key, fields++))}</w:t></w:r></w:p>`,
    )
    .join('');

  return zipDeflated(
    unzip(readFileSync(BASE_TEMPLATE)).map((file) =>
      file.name === 'word/document.xml'
        ? {
            name: file.name,
            data: Buffer.from(
              file.data
                .toString('utf8')
                .replace(/<w:body>[\s\S]*?(<w:sectPr[\s\S]*<\/w:sectPr>)?<\/w:body>/, `<w:body>${body}$1</w:body>`),
            ),
          }
        : file,
    ),
  );
}
