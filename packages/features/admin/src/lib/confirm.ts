export function nameMatchesConfirmation(typed: string, name: string): boolean {
  const target = name.trim();

  return target.length > 0 && typed.trim() === target;
}
