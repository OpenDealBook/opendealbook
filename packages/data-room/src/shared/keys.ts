export const dataRoomKeys = {
  room: (dealId: string) => ['data-room', dealId] as const,
  folderContents: (folderId: string) =>
    ['data-room', 'folder', folderId] as const,
};
