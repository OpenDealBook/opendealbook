import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

type Client = SupabaseClient<Database>;

export type CommentAuthorRole =
  | 'team'
  | 'buyer_counsel'
  | 'seller_counsel'
  | 'seller';

export interface ContractComment {
  id: string;
  author: { name: string | null; role: CommentAuthorRole };
  side: Database['public']['Enums']['counsel_side'];
  quotedText: string | null;
  body: string;
  internal: boolean;
  resolved: boolean;
}

export interface CommentThread extends ContractComment {
  replies: ContractComment[];
}

export async function versionComments(
  client: Client,
  contractVersionIds: string[],
): Promise<Record<string, CommentThread[]>> {
  const { data: rows } = await client
    .from('contract_comment')
    .select(
      'id, contract_version_id, parent_id, author_side, quoted_text, body, internal, resolved_at',
    )
    .in('contract_version_id', contractVersionIds)
    .order('created_at')
    .throwOnError();
  const { data: authors } = await client
    .rpc('contract_comment_authors', {
      contract_version_ids: contractVersionIds,
    })
    .throwOnError();

  const comment = (row: (typeof rows)[number]): ContractComment => {
    const author = authors.find(({ comment_id }) => comment_id === row.id)!;

    return {
      id: row.id,
      author: {
        name: author.author_name,
        role: author.author_role as CommentAuthorRole,
      },
      side: row.author_side,
      quotedText: row.quoted_text,
      body: row.body,
      internal: row.internal,
      resolved: row.resolved_at !== null,
    };
  };

  return Object.fromEntries(
    contractVersionIds.map((versionId) => [
      versionId,
      rows
        .filter(
          (row) =>
            row.contract_version_id === versionId && row.parent_id === null,
        )
        .map((root) => ({
          ...comment(root),
          replies: rows.filter((row) => row.parent_id === root.id).map(comment),
        })),
    ]),
  );
}
