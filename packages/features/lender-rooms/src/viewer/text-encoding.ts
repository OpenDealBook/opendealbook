function byteOrderMarkEncoding(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  return 'utf-8';
}

export function decodeText(bytes: ArrayBuffer): string {
  return new TextDecoder(byteOrderMarkEncoding(new Uint8Array(bytes))).decode(
    bytes,
  );
}

export function decodeCodePage(bytes: ArrayBuffer, codePage: number): string {
  if (codePage >= 1250 && codePage <= 1258) {
    return new TextDecoder(`windows-${codePage}`).decode(bytes);
  }
  if (codePage >= 28591 && codePage <= 28605) {
    return new TextDecoder(`iso-8859-${codePage - 28590}`).decode(bytes);
  }
  return decodeText(bytes);
}
