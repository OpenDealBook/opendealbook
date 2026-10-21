import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { respondToSellerShareRequest } from '@odb/templates/delivery';

interface RouteContext {
  params: Promise<{ roomId: string; shareId: string }>;
}

export async function GET(request: Request, { params }: RouteContext) {
  const { roomId, shareId } = await params;

  return respondToSellerShareRequest({
    client: getSupabaseServerClient(),
    admin: getSupabaseServerAdminClient(),
    request,
    roomId,
    shareId,
  });
}
