import { describe, expect, it } from 'vitest';

import { sniffImageType } from './sniff-image';

function bytes(...parts: (string | number[])[]): Uint8Array {
  return Buffer.concat(
    parts.map((part) =>
      typeof part === 'string'
        ? Buffer.from(part, 'latin1')
        : Buffer.from(part),
    ),
  );
}

describe('sniffImageType', () => {
  it.each([
    ['image/png', bytes([0x89], 'PNG\r\n', [0x1a, 0x0a, 0, 0])],
    ['image/jpeg', bytes([0xff, 0xd8, 0xff, 0xe0, 0, 16], 'JFIF')],
    ['image/gif', bytes('GIF89a', [1, 0, 1, 0])],
    ['image/gif', bytes('GIF87a', [1, 0, 1, 0])],
    ['image/webp', bytes('RIFF', [36, 0, 0, 0], 'WEBPVP8 ')],
    ['image/x-icon', bytes([0, 0, 1, 0, 1, 0, 16, 16])],
    ['image/svg+xml', bytes('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ['image/svg+xml', bytes('<svg>', '</svg>')],
    ['image/svg+xml', bytes('\n  \t<svg viewBox="0 0 1 1"></svg>')],
    [
      'image/svg+xml',
      bytes('<?xml version="1.0" encoding="UTF-8"?>\n<svg></svg>'),
    ],
    ['image/svg+xml', bytes('<!-- made by hand -->\n<svg></svg>')],
    [
      'image/svg+xml',
      bytes(
        '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<svg></svg>',
      ),
    ],
    [
      'image/svg+xml',
      bytes(
        '<?xml version="1.0" encoding="utf-8"?>\n<!-- Generator: Adobe Illustrator 24.0.0 -->\n<!-- second -->\n<!doctype svg>\n<svg version="1.1"></svg>',
      ),
    ],
  ])('recognises %s', (type, content) => {
    expect(sniffImageType(content)).toBe(type);
  });

  it.each([
    ['nothing', bytes()],
    ['an HTML page', bytes('<!doctype html><html><svg></svg></html>')],
    ['a tag that only starts with svg', bytes('<svgfoo></svgfoo>')],
    ['an XML document that is not SVG', bytes('<?xml version="1.0"?><rss/>')],
    ['an XML declaration that never ends', bytes('<?xml version="1.0"')],
    ['a RIFF file that is not WebP', bytes('RIFF', [36, 0, 0, 0], 'WAVEfmt ')],
    ['a GIF header cut short', bytes('GIF8')],
    ['a PNG header cut short', bytes([0x89], 'PNG')],
    ['an icon header with the wrong type', bytes([0, 0, 2, 0, 1, 0])],
    ['a comment that never ends', bytes('<!-- <svg></svg>')],
    ['a doctype that never ends', bytes('<!DOCTYPE svg <svg')],
    ['an HTML page behind a comment', bytes('<!-- hi --><html></html>')],
    ['a PDF', bytes('%PDF-1.7')],
    ['text', bytes('hello')],
  ])('refuses %s', (_label, content) => {
    expect(sniffImageType(content)).toBeNull();
  });
});
