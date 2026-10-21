import { respondToSellerCounselFolderDocumentRequest } from '@odb/deal-counsel/documents.ts';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

interface RouteContext {
  params: Promise<{ dealId: string; documentId: string }>;
}

export async function GET(request: Request, { params }: RouteContext) {
  const { dealId, documentId } = await params;

  return respondToSellerCounselFolderDocumentRequest({
    client: getSupabaseServerClient(),
    admin: getSupabaseServerAdminClient(),
    request,
    dealId,
    documentId,
  });
}
