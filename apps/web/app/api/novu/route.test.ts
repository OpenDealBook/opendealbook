import { createHmac } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

const roomRow = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));

vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => ({
            throwOnError: async () => ({ data: roomRow.current }),
          }),
        }),
      }),
    }),
  }),
}));

async function importRoute(novuApiKey: string | undefined) {
  vi.resetModules();
  vi.stubEnv('NOVU_API_KEY', novuApiKey);

  return import('./route');
}

const discover = () =>
  new Request('https://opendealbook.com/api/novu?action=discover');

describe('Novu bridge route', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('refuses an unsigned request to run a workflow step', async () => {
    const { POST } = await importRoute('test-novu-secret');
    const response = await POST(
      new Request(
        'https://opendealbook.com/api/novu?action=execute&workflowId=lender_ask.answered&stepId=email',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            payload: { roomId: 'room', askId: 'ask', kind: 'ask' },
          }),
        },
      ),
    );

    expect(response.status).toBe(401);
  });

  it('refuses an unsigned request to list the workflows', async () => {
    const { GET } = await importRoute('test-novu-secret');

    expect((await GET(discover())).status).toBe(401);
  });

  it('loads without a Novu key and refuses every request', async () => {
    const { GET, POST } = await importRoute(undefined);

    expect((await GET(discover())).status).toBe(401);
    expect(
      (
        await POST(
          new Request('https://opendealbook.com/api/novu?action=execute', {
            method: 'POST',
            body: '{}',
          }),
        )
      ).status,
    ).toBe(401);
  });

  it('serves only the methods Novu calls', async () => {
    expect(Object.keys(await importRoute('test-novu-secret')).sort()).toEqual([
      'GET',
      'POST',
    ]);
  });

  it.each([
    {
      title: 'a team account by its slug',
      account: { slug: 'acme-capital' },
      link: 'https://opendealbook.com/home/acme-capital/deals/deal-1/lenders/room-1',
    },
    {
      title: 'an account with no slug, which falls back to home',
      account: { slug: null },
      link: 'https://opendealbook.com/home',
    },
  ])('links a room held by $title', async ({ account, link }) => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://opendealbook.com');
    roomRow.current = {
      name: 'First Harbor Bank',
      deal_id: 'deal-1',
      deal: { firm: { name: 'Acme Tooling' } },
      accounts: account,
    };
    const { POST } = await importRoute('test-novu-secret');
    const body = {
      payload: { roomId: 'room-1', email: 'banker@firstharbor.example' },
      controls: {},
      state: [],
      subscriber: { subscriberId: 'user-1' },
    };
    const timestamp = Date.now();
    const signature = createHmac('sha256', 'test-novu-secret')
      .update(`${timestamp}.${JSON.stringify(body)}`)
      .digest('hex');

    const response = await POST(
      new Request(
        'https://opendealbook.com/api/novu?action=execute&workflowId=lender_room.access_requested&stepId=email',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'novu-signature': `t=${timestamp},v1=${signature}`,
          },
          body: JSON.stringify(body),
        },
      ),
    );
    const { outputs } = (await response.json()) as {
      outputs: { body: string };
    };

    expect(outputs.body).toContain(`href="${link}"`);
  });
});
