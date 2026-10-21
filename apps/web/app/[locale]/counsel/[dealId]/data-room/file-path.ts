export function counselFilePath(dealId: string, documentId: string): string {
  return `/counsel/${dealId}/data-room/files/${documentId}?disposition=download`;
}
