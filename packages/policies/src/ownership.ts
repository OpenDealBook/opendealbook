export function isAccountOwner(ownerUserId: string, userId: string): boolean {
  return ownerUserId === userId;
}
