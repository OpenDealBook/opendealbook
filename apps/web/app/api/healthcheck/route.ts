import { NextResponse } from 'next/server';

import { getSupabaseServerAdminClient } from '@tuckin/supabase/server';

export async function GET() {
  const client = getSupabaseServerAdminClient();
  const { error } = await client.auth.getSession();

  return NextResponse.json({
    status: 'ok',
    services: { database: !error },
  });
}
