import { respondToSellerZipRequest } from '@odb/seller-rooms/files/zip-download.ts';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

interface RouteContext {
  params: Promise<{ roomId: string }>;
}

export async function POST(request: Request, { params }: RouteContext) {
  const { roomId } = await params;

  return respondToSellerZipRequest({
    client: getSupabaseServerClient(),
    admin: getSupabaseServerAdminClient(),
    request,
    roomId,
  });
}
