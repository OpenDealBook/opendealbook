'use client';

import { useQuery } from '@tanstack/react-query';

import { useSupabase } from '@odb/supabase/hooks';

import { dataRoomKeys, listByFolder } from '../shared';

export function useFolderContents(folderId: string) {
  const client = useSupabase();

  return useQuery({
    queryKey: dataRoomKeys.folderContents(folderId),
    queryFn: () => listByFolder(client, folderId),
    enabled: !!folderId,
  });
}
