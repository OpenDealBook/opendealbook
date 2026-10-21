import { crc32, inflateRawSync } from 'node:zlib';

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function documentXml(paragraphs: string[]): string {
  const body = paragraphs
    .map((text) => `<w:p><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
}

export function zipStored(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nameBytes = Buffer.from(name);
    const checksum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + data.length;
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

export function wordDocument(paragraphs: string[]): Buffer {
  return zipStored([
    { name: '[Content_Types].xml', data: Buffer.from(CONTENT_TYPES) },
    { name: '_rels/.rels', data: Buffer.from(ROOT_RELS) },
    { name: 'word/document.xml', data: Buffer.from(documentXml(paragraphs)) },
  ]);
}

export function wordDocumentText(docx: Buffer): string {
  const end = docx.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const entries = docx.readUInt16LE(end + 10);
  let cursor = docx.readUInt32LE(end + 16);

  for (let index = 0; index < entries; index++) {
    const method = docx.readUInt16LE(cursor + 10);
    const compressedSize = docx.readUInt32LE(cursor + 20);
    const nameLength = docx.readUInt16LE(cursor + 28);
    const extraLength = docx.readUInt16LE(cursor + 30);
    const commentLength = docx.readUInt16LE(cursor + 32);
    const localOffset = docx.readUInt32LE(cursor + 42);
    const name = docx.toString('utf8', cursor + 46, cursor + 46 + nameLength);

    if (name === 'word/document.xml') {
      const dataStart =
        localOffset +
        30 +
        docx.readUInt16LE(localOffset + 26) +
        docx.readUInt16LE(localOffset + 28);
      const raw = docx.subarray(dataStart, dataStart + compressedSize);
      const xml = (method === 8 ? inflateRawSync(raw) : raw).toString('utf8');
      return xml
        .replaceAll('</w:p>', '\n')
        .replaceAll(/<[^>]+>/g, '')
        .replaceAll('&amp;', '&');
    }

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  throw new Error('word/document.xml not found');
}
