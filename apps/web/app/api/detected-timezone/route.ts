import { NextResponse } from 'next/server';

import { UpdateTimezoneSchema } from '@odb/accounts/schema';
import { getSupabaseServerClient, requireUser } from '@odb/supabase/server';

const CHECK_VIOLATION = '23514';

function appSpelling(timezone: string) {
  try {
    return new Intl.DateTimeFormat('en', {
      timeZone: timezone,
    }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

function unsupported(timezone: string) {
  const response = new NextResponse(null, { status: 422 });
  response.cookies.set('unsupported_timezone', timezone, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

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
  const spelled = appSpelling(timezone);

  if (spelled === null) {
    return unsupported(timezone);
  }

  const { error } = await client
    .from('accounts')
    .update({ timezone: spelled })
    .eq('primary_owner_user_id', user.id)
    .eq('is_personal_account', true)
    .is('timezone', null);

  if (error?.code === CHECK_VIOLATION) {
    return unsupported(timezone);
  }
  if (error) {
    throw error;
  }

  return new NextResponse(null, { status: 204 });
}
