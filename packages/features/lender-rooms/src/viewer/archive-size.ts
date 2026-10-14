import { Unzip, UnzipInflate } from 'fflate';

const SLICE_BYTES = 64 * 1024;

export function inflatesBeyond(archive: Uint8Array, limit: number): boolean {
  let inflated = 0;
  const unzip = new Unzip((part) => {
    part.ondata = (_error, chunk) => {
      inflated += chunk.length;
    };
    part.start();
  });
  unzip.register(UnzipInflate);
  for (
    let offset = 0;
    offset < archive.length && inflated <= limit;
    offset += SLICE_BYTES
  ) {
    unzip.push(archive.subarray(offset, offset + SLICE_BYTES));
  }
  return inflated > limit;
}
