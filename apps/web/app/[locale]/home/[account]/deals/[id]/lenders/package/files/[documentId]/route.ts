import { respondToPackageDocumentRequest } from '@odb/lender-rooms/activity/package-document-access.ts';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

interface RouteContext {
  params: Promise<{ account: string; id: string; documentId: string }>;
}

export async function GET(request: Request, { params }: RouteContext) {
  const { account, id, documentId } = await params;

  return respondToPackageDocumentRequest({
    client: getSupabaseServerClient(),
    admin: getSupabaseServerAdminClient(),
    request,
    accountSlug: account,
    dealId: id,
    documentId,
  });
}
