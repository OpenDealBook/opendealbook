export function nextVersion(existingVersions: number[]): number {
  return existingVersions.length ? Math.max(...existingVersions) + 1 : 1;
}
