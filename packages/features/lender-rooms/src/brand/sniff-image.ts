const SIGNATURES: [type: string, signature: string][] = [
  ['image/png', '\x89PNG\r\n\x1a\n'],
  ['image/jpeg', '\xff\xd8\xff'],
  ['image/gif', 'GIF87a'],
  ['image/gif', 'GIF89a'],
  ['image/x-icon', '\x00\x00\x01\x00'],
];

const SNIFFED_BYTES = 1024;

const SVG_PREAMBLES: [opening: string, closing: string][] = [
  ['<?xml', '?>'],
  ['<!--', '-->'],
  ['<!doctype', '>'],
];

function startsAsSvg(head: string): boolean {
  let text = head.trimStart();

  for (;;) {
    const lowered = text.slice(0, 9).toLowerCase();
    const preamble = SVG_PREAMBLES.find(([opening]) =>
      lowered.startsWith(opening),
    );

    if (!preamble) {
      return /^<svg[\s>]/.test(text);
    }

    const end = text.indexOf(preamble[1]);

    if (end === -1) {
      return false;
    }

    text = text.slice(end + preamble[1].length).trimStart();
  }
}

export function sniffImageType(bytes: Uint8Array): string | null {
  const head = Buffer.from(bytes.subarray(0, SNIFFED_BYTES)).toString('latin1');
  const known = SIGNATURES.find(([, signature]) => head.startsWith(signature));

  if (known) {
    return known[0];
  }

  if (head.startsWith('RIFF') && head.startsWith('WEBP', 8)) {
    return 'image/webp';
  }

  return startsAsSvg(head) ? 'image/svg+xml' : null;
}
