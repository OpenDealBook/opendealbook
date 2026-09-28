'use client';

import { useQuery } from '@tanstack/react-query';

import type { Tables } from '@odb/supabase';
import { useSupabase } from '@odb/supabase/hooks';

import { buildFolderTree, type FolderNode } from '../folders/tree';
import { dataRoomKeys, fetchDocuments, fetchFolders } from '../shared';

export interface DataRoom {
  tree: FolderNode[];
  documents: Tables<'dr_document'>[];
}

export function useDataRoom(dealId: string) {
  const client = useSupabase();

  return useQuery<DataRoom>({
    queryKey: dataRoomKeys.room(dealId),
    queryFn: async () => {
      const [folders, documents] = await Promise.all([
        fetchFolders(client, dealId),
        fetchDocuments(client, dealId),
      ]);

      return { tree: buildFolderTree(folders), documents };
    },
    enabled: !!dealId,
  });
}
