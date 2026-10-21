export function isOwnDealStoragePath({
  deal_id,
  storage_path,
}: {
  deal_id: string;
  storage_path: string;
}): boolean {
  return (
    storage_path.startsWith(`deal/${deal_id}/`) &&
    !storage_path.includes('\\') &&
    storage_path
      .split('/')
      .every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  );
}
