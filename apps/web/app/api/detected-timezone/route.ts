import { NextResponse } from 'next/server';

import { UpdateTimezoneSchema } from '@odb/accounts/schema';
import { getSupabaseServerClient, requireUser } from '@odb/supabase/server';

const CHECK_VIOLATION = '23514';

export async function POST(request: Request) {
  const client = getSupabaseServerClient();
  const { data: user } = await requireUser(client);

  if (!user) {
    return new NextResponse(null, { status: 401 });
  }

  const body = UpdateTimezoneSchema.safeParse(await request.json());

  if (!body.success) {
    return new NextResponse(null, { status: 400 });
  }

  const { timezone } = body.data;
  const { error } = await client
    .from('accounts')
    .update({ timezone })
    .eq('primary_owner_user_id', user.id)
    .eq('is_personal_account', true)
    .is('timezone', null);

  if (error?.code === CHECK_VIOLATION) {
    const response = new NextResponse(null, { status: 422 });
    response.cookies.set('unsupported_timezone', timezone, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  }
  if (error) {
    throw error;
  }

  return new NextResponse(null, { status: 204 });
}
