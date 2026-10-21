import { NextRequest, NextResponse } from 'next/server';

import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/middleware', () => ({
  default: () => (request: NextRequest) =>
    NextResponse.next({ request: { headers: new Headers(request.headers) } }),
}));

vi.mock('~/i18n/routing', () => ({ routing: {} }));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({}) } }),
}));

import proxy from './proxy';

describe('proxy', () => {
  it('forwards the request path and query to server components as x-request-path', async () => {
    const response = await proxy(
      new NextRequest('http://localhost/home/acme/members?tab=open'),
    );

    expect(response.headers.get('x-middleware-request-x-request-path')).toBe(
      '/home/acme/members?tab=open',
    );
  });
});
