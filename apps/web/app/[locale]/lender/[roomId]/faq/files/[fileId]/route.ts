import { respondToFaqFileRequest } from '@odb/lender-rooms/activity/faq-file-access.ts';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

interface RouteContext {
  params: Promise<{ roomId: string; fileId: string }>;
}

export async function GET(request: Request, { params }: RouteContext) {
  const { roomId, fileId } = await params;

  return respondToFaqFileRequest({
    client: getSupabaseServerClient(),
    admin: getSupabaseServerAdminClient(),
    request,
    roomId,
    fileId,
  });
}
