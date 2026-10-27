import { createHmac } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const TEAM_ID = '00000000-0000-4000-8000-000000000001';
const SECRET = 'lob-hook-secret';

const world = vi.hoisted(() => ({
  secrets: {} as Record<string, string | null>,
  updates: [] as string[],
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerAdminClient: () => ({
    rpc: (_name: string, args: { p_account_id: string }) => ({
      throwOnError: async () => ({ data: world.secrets[args.p_account_id] ?? null }),
    }),
    from: (table: string) => ({
      update: (patch: { status: string }) => {
        const filters: string[] = [];
        const chain = {
          eq: (column: string, value: string) => {
            filters.push(`${column}=${value}`);
            return chain;
          },
          in: (column: string, values: string[]) => {
            filters.push(`${column} in ${values.join(',')}`);
            return chain;
          },
          throwOnError: async () => {
            world.updates.push(`${table} status=${patch.status} where ${filters.join(' ')}`);
            return { data: null };
          },
        };
        return chain;
      },
    }),
  }),
}));

const { POST } = await import('./route');

function signed(event: unknown, secret = SECRET, timestamp = String(Date.now())) {
  const body = JSON.stringify(event);
  return new Request(`https://opendealbook.com/api/webhooks/lob/${TEAM_ID}`, {
    method: 'POST',
    headers: {
      'Lob-Signature': createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex'),
      'Lob-Signature-Timestamp': timestamp,
    },
    body,
  });
}

const EARLIER: Record<string, string> = {
  mailed: 'queued,created',
  in_transit: 'queued,created,mailed',
  delivered: 'queued,created,mailed,in_transit',
  returned: 'queued,created,mailed,in_transit,delivered',
};

function letterEvent(type: string) {
  return { id: 'evt_1', event_type: { id: type }, body: { id: 'ltr_123', object: 'letter' } };
}

function post(request: Request, accountId = TEAM_ID) {
  return POST(request, { params: Promise.resolve({ accountId }) });
}

beforeEach(() => {
  world.secrets = { [TEAM_ID]: SECRET };
  world.updates = [];
});

describe('the Lob webhook', () => {
  it.each([
    ['letter.mailed', 'mailed'],
    ['letter.in_transit', 'in_transit'],
    ['letter.in_local_area', 'in_transit'],
    ['letter.processed_for_delivery', 'in_transit'],
    ['letter.delivered', 'delivered'],
    ['letter.returned_to_sender', 'returned'],
  ])('records %s as %s on the team letter', async (type, status) => {
    const response = await post(signed(letterEvent(type)));

    expect(response.status).toBe(200);
    expect(world.updates).toEqual([
      `outreach_letter status=${status} where account_id=${TEAM_ID} provider=lob provider_letter_id=ltr_123 status in ${EARLIER[status]}`,
    ]);
  });

  it('refuses an event signed more than 5 minutes ago', async () => {
    const response = await post(signed(letterEvent('letter.delivered'), SECRET, String(Date.now() - 5 * 60_000 - 1_000)));

    expect(response.status).toBe(401);
    expect(world.updates).toEqual([]);
  });

  it('answers 404 for a team address that is not a uuid', async () => {
    const response = await post(signed(letterEvent('letter.delivered')), 'not-a-team');

    expect(response.status).toBe(404);
    expect(world.updates).toEqual([]);
  });

  it('acknowledges an event it does not track without changing anything', async () => {
    const response = await post(signed(letterEvent('letter.created')));

    expect(response.status).toBe(200);
    expect(world.updates).toEqual([]);
  });

  it('refuses a request signed with another secret', async () => {
    const response = await post(signed(letterEvent('letter.delivered'), 'someone-else'));

    expect(response.status).toBe(401);
    expect(world.updates).toEqual([]);
  });

  it('refuses every request for a team without a webhook secret', async () => {
    world.secrets = {};

    const response = await post(signed(letterEvent('letter.delivered')));

    expect(response.status).toBe(401);
    expect(world.updates).toEqual([]);
  });
});
