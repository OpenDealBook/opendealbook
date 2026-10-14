import { respondToZipRequest } from '@odb/lender-rooms/activity/zip-download.ts';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

interface RouteContext {
  params: Promise<{ roomId: string }>;
}

export async function POST(request: Request, { params }: RouteContext) {
  const { roomId } = await params;

  return respondToZipRequest({
    client: getSupabaseServerClient(),
    admin: getSupabaseServerAdminClient(),
    request,
    roomId,
  });
}
