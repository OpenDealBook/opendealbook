import { sellerCounselThreadFileUrl } from '@odb/seller-rooms/counsel-thread/queries.ts';
import { getSupabaseServerClient } from '@odb/supabase/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const url = await sellerCounselThreadFileUrl(
    getSupabaseServerClient(),
    (await params).fileId,
  );

  return url
    ? Response.redirect(url, 307)
    : new Response(null, { status: 404 });
}
