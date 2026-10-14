import { respondToDocumentRequest } from '@odb/lender-rooms/activity/document-access.ts';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

interface RouteContext {
  params: Promise<{ roomId: string; documentId: string }>;
}

export async function GET(request: Request, { params }: RouteContext) {
  const { roomId, documentId } = await params;

  return respondToDocumentRequest({
    client: getSupabaseServerClient(),
    admin: getSupabaseServerAdminClient(),
    request,
    roomId,
    documentId,
  });
}
