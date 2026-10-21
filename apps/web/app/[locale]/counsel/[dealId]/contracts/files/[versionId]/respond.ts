import { contractVersionFile } from '@odb/contracts';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

export async function respondWithContractFile(
  contractVersionId: string,
  kind: 'docx' | 'pdf',
): Promise<Response> {
  const file = await contractVersionFile(
    getSupabaseServerClient(),
    getSupabaseServerAdminClient(),
    contractVersionId,
    kind,
  );

  if (!file) {
    return new Response(null, { status: 404 });
  }

  return new Response(Buffer.from(file.bytes), {
    headers: {
      'content-type': file.contentType,
      'content-disposition': `attachment; filename="${file.filename}"`,
      'cache-control': 'private, no-store',
    },
  });
}
