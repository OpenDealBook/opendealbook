import {
  convertFile,
  type DoclingConfig,
} from '../src/documentIngestion/docling';
import {
  extractSegments,
  ingestibleFormat,
} from '../src/documentIngestion/segments';

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const config: DoclingConfig = {
  baseUrl: process.env.DOCLING_URL ?? 'http://localhost:5001',
  apiKey: process.env.DOCLING_API_KEY ?? '',
};

function onePagePdf(text: string): Uint8Array {
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((body, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

const health = await fetch(`${config.baseUrl}/health`).catch(() => null);
if (!health?.ok) {
  console.log(`docling-serve is not answering at ${config.baseUrl}; skipping`);
  process.exit(0);
}

const path = process.argv[2];
const name = path ? basename(path) : 'Harbor Lane Bakery memo.pdf';
const bytes = path
  ? new Uint8Array(await readFile(path))
  : onePagePdf('Harbor Lane Bakery revenue 2024: $1,388,000');
const format = ingestibleFormat(name);
if (!format) {
  console.log(`${name} is not a format ingestion reads`);
  process.exit(1);
}

const segments = await extractSegments(
  { name, bytes, format },
  {
    convert: (file, fileName, pass) =>
      convertFile(config, file, fileName, pass),
    toPdf: () => {
      throw new Error(
        'the smoke script does not convert office files; pass a PDF',
      );
    },
  },
  process.argv.includes('--force-ocr'),
);

console.log(JSON.stringify(segments, null, 2));
