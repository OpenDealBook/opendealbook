export const SELLER_COUNSEL_THREAD_BUCKET = 'seller-counsel-thread';

export const MAX_MESSAGE_LENGTH = 10_000;
export const MAX_MESSAGE_FILES = 20;
export const MESSAGE_TOO_LONG = 'A message can be at most 10,000 characters.';
export const TOO_MANY_FILES = 'Attach at most 20 files to one message.';

// Characters storage keys may not hold, so a name like "P&L.xlsx" survives as
// the file's own name.
const NOT_IN_A_STORAGE_KEY = /[^\w!\-.*'() &$@=;:+,?]/g;

export function threadFilePath(dealId: string, name: string): string {
  return `${dealId}/${crypto.randomUUID()}/${name.replace(NOT_IN_A_STORAGE_KEY, '_')}`;
}

export function threadFileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}
