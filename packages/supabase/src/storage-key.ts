const UNSAFE_IN_STORAGE_KEY = /[^A-Za-z0-9._-]/g;

export function storageKeyName(name: string): string {
  return name.replace(UNSAFE_IN_STORAGE_KEY, '_');
}
