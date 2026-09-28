/// <reference path="../server-only.d.ts" />
import 'server-only';
import type { User } from '@supabase/supabase-js';

import type { ZodType } from 'zod';

import { getSupabaseServerClient } from '@odb/supabase/server';

interface EnhanceRouteHandlerConfig<Body> {
  auth?: boolean;
  schema?: ZodType<Body>;
}

interface HandlerParams<Body> {
  request: Request;
  user: User | undefined;
  body: Body;
}

export function enhanceRouteHandler<Body>(
  fn: (params: HandlerParams<Body>) => Promise<Response>,
  config: EnhanceRouteHandlerConfig<Body> = {},
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    let user: User | undefined;

    if (config.auth !== false) {
      const { data } = await getSupabaseServerClient().auth.getUser();

      if (!data.user) {
        return new Response('Unauthorized', { status: 401 });
      }

      user = data.user;
    }

    let body = undefined as Body;

    if (config.schema) {
      const parsed = config.schema.safeParse(await request.json());

      if (!parsed.success) {
        return new Response(parsed.error.message, { status: 400 });
      }

      body = parsed.data;
    }

    return fn({ request, user, body });
  };
}
