import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@odb/supabase/server';

import pathsConfig from '~/config/paths.config';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? pathsConfig.app.home;

  if (code) {
    const supabase = getSupabaseServerClient();

    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
