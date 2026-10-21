import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => ({
  user: null as { id: string } | null,
  rooms: [] as { id: string; deal_id: string }[],
  owners: { 'deal-1': 'Dana Owner' } as Record<string, string>,
  phoneAskedAt: null as string | null,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerAdminClient: () => ({}),
  getSupabaseServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: world.user } }) },
    rpc: () => ({ throwOnError: async () => ({ data: world.rooms }) }),
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => ({
            throwOnError: async () => ({
              data: { phone_asked_at: world.phoneAskedAt },
            }),
          }),
        }),
      }),
    }),
  }),
}));
vi.mock('../../_components/phone-prompt', () => ({
  PhonePrompt: () => <form data-phone-prompt />,
}));
vi.mock('@odb/seller-rooms/members/people.ts', () => ({
  dealOwnerName: async (_admin: unknown, dealId: string) =>
    world.owners[dealId],
}));

import { SellerPhonePrompt } from './seller-phone-prompt';

async function shown() {
  const prompt = await SellerPhonePrompt();

  return prompt ? renderToStaticMarkup(prompt).replaceAll('&#x27;', "'") : null;
}

async function asks() {
  return (await shown())?.includes('data-phone-prompt') ?? false;
}

describe('the seller phone prompt', () => {
  beforeEach(() => {
    world.user = { id: 'seller-1' };
    world.rooms = [{ id: 'room-1', deal_id: 'deal-1' }];
    world.phoneAskedAt = null;
  });

  it('asks a seller in a room who was never asked', async () => {
    expect(await asks()).toBe(true);
  });

  it('says the deal owner will text them, and who sees the number', async () => {
    expect(await shown()).toContain(
      'so Dana Owner can text you when something needs you',
    );
    expect(await shown()).toContain("the buyer's team and counsel on the deal");
  });

  it("says the buyer's team will text them when they are in several rooms", async () => {
    world.rooms = [
      { id: 'room-1', deal_id: 'deal-1' },
      { id: 'room-2', deal_id: 'deal-2' },
    ];

    expect(await shown()).toContain(
      "so the buyer's team can text you when something needs you",
    );
  });

  it('asks only once', async () => {
    world.phoneAskedAt = '2026-10-16T12:00:00Z';

    expect(await asks()).toBe(false);
  });

  it('does not ask someone with no seller room', async () => {
    world.rooms = [];

    expect(await asks()).toBe(false);
  });

  it('does not ask a visitor who is not signed in', async () => {
    world.user = null;

    expect(await asks()).toBe(false);
  });
});
