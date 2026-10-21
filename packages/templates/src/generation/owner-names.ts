export function formatOwnerNames(names: string[]): string {
  if (names.length <= 1) {
    return names.join('');
  }

  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
