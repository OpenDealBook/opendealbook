import { describe, expect, it } from 'vitest';

import { decodeCodePage, decodeText } from './text-encoding';

const bytes = (...values: number[]) => Uint8Array.from(values).buffer;

describe('decodeText', () => {
  it('reads bytes with no byte order mark as UTF-8', () => {
    expect(decodeText(bytes(0x43, 0x61, 0x66, 0xc3, 0xa9))).toBe('Café');
  });

  it('honours a UTF-8 byte order mark and leaves it out of the text', () => {
    expect(decodeText(bytes(0xef, 0xbb, 0xbf, 0xc3, 0xa9))).toBe('é');
  });

  it('honours a little-endian UTF-16 byte order mark', () => {
    expect(decodeText(bytes(0xff, 0xfe, 0xe9, 0x00))).toBe('é');
  });

  it('honours a big-endian UTF-16 byte order mark', () => {
    expect(decodeText(bytes(0xfe, 0xff, 0x00, 0xe9))).toBe('é');
  });
});

describe('decodeCodePage', () => {
  it('reads a Windows code page', () => {
    expect(decodeCodePage(bytes(0x43, 0x61, 0x66, 0xe9), 1252)).toBe('Café');
  });

  it('reads an ISO 8859 code page', () => {
    expect(decodeCodePage(bytes(0xb3), 28592)).toBe('ł');
  });

  it('reads any other code page as UTF-8', () => {
    expect(decodeCodePage(bytes(0xc3, 0xa9), 65001)).toBe('é');
  });
});
