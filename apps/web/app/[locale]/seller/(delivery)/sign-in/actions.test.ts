import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  pending: [] as Promise<unknown>[],
  env: { SELLER_DELIVERY_FROM_EMAIL: undefined as string | undefined },
  requestSellerSignIn: vi.fn(async () => {}),
  logError: vi.fn(),
}));

vi.mock('next/server', () => ({
  after: (task: () => Promise<unknown>) => state.pending.push(task()),
}));
vi.mock('@odb/shared/logger', () => ({
  getLogger: () => ({ error: state.logError }),
}));
vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => ({}),
}));
vi.mock('@odb/seller-rooms/members/sign-in-request.ts', () => ({
  requestSellerSignIn: state.requestSellerSignIn,
}));
vi.mock('../../../../../env', () => ({ env: state.env }));

const { requestSellerSignInLink } = await import('./actions');

const SHARE = '0b6c1f2e-8a43-4c1d-9a7e-2f5d3c4b1a90';

function form() {
  const data = new FormData();
  data.set('email', 'Sam@Seller.test');
  data.set('next', `/seller/documents/${SHARE}`);
  return data;
}

async function submit() {
  const answer = await requestSellerSignInLink(null, form());
  await Promise.all(state.pending);
  return answer;
}

beforeEach(() => {
  state.pending = [];
  state.requestSellerSignIn.mockClear();
  state.logError.mockClear();
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://app.odb.test');
});

describe('requestSellerSignInLink', () => {
  it('requests the link with the configured sender', async () => {
    state.env.SELLER_DELIVERY_FROM_EMAIL = 'Deals <deals@odb.test>';

    expect(await submit()).toEqual({
      email: 'sam@seller.test',
      sender: 'Deals <deals@odb.test>',
    });
    expect(state.requestSellerSignIn).toHaveBeenCalledWith(
      {},
      { email: 'sam@seller.test', next: `/seller/documents/${SHARE}` },
      { origin: 'https://app.odb.test', from: 'Deals <deals@odb.test>' },
    );
  });

  it('gives the same answer and logs the error when no sender is set up', async () => {
    state.env.SELLER_DELIVERY_FROM_EMAIL = undefined;

    expect(await submit()).toEqual({
      email: 'sam@seller.test',
      sender: undefined,
    });
    expect(state.requestSellerSignIn).not.toHaveBeenCalled();
    expect(state.logError).toHaveBeenCalledWith(
      {
        err: expect.objectContaining({ message: 'Seller email is not set up' }),
      },
      'Seller sign-in link was not sent',
    );
  });
});
