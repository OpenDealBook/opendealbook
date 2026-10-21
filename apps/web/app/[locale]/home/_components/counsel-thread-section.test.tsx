// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { fakeRealtime } from './fake-realtime';

const threads = vi.hoisted(() => ({
  buyer: [
    {
      id: 'm1',
      author_name: 'Bea Buyerlaw',
      from_team: false,
      body: 'Buyer side note',
      created_at: '2026-10-15T14:00:00Z',
    },
  ],
  seller: [
    {
      id: 'm2',
      author_name: 'Sol Sellerlaw',
      from_team: false,
      body: 'Seller side note',
      created_at: '2026-10-15T15:00:00Z',
    },
  ],
}));

const posting = vi.hoisted(() => ({ block: null as string | null }));
const sellerRoom = vi.hoisted(() => ({ members: [] as { name: string }[] }));

vi.mock('@odb/deal-counsel/thread.ts', () => ({
  loadCounselThread: async (_dealId: string, side: 'buyer' | 'seller') =>
    threads[side],
  postCounselMessage: vi.fn(),
  teamPostingBlock: async () => posting.block,
}));
vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    rpc: () => ({
      throwOnError: async () => ({ data: sellerRoom.members }),
    }),
  }),
}));
vi.mock('@odb/supabase/hooks', () => ({
  useSupabase: () => fakeRealtime().client,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => '/home/team/deals/deal-1',
}));

import { CounselThreadSection } from './counsel-thread-section';

function cards(markup: string) {
  const document = new DOMParser().parseFromString(markup, 'text/html');

  return [...document.querySelectorAll('[data-slot="card"]')].map(
    (card) => card.textContent,
  );
}

describe('CounselThreadSection', () => {
  it("shows the team a separate thread with each side's counsel", async () => {
    const markup = renderToStaticMarkup(
      await CounselThreadSection({ dealId: 'deal-1' }),
    );

    const [buyer, seller] = cards(markup);

    expect(buyer).toContain("Buyer's counsel");
    expect(buyer).toContain('Buyer side note');
    expect(buyer).not.toContain('Seller side note');
    expect(seller).toContain("Seller's counsel");
    expect(seller).toContain('Seller side note');
    expect(seller).not.toContain('Buyer side note');
  });

  it('shows both threads read-only, with the reason, to a team member who cannot post', async () => {
    posting.block = 'This team is read-only until billing is updated.';

    const markup = renderToStaticMarkup(
      await CounselThreadSection({ dealId: 'deal-1' }),
    );

    for (const card of cards(markup)) {
      expect(card).toContain(
        'This team is read-only until billing is updated.',
      );
    }
    expect(markup).not.toContain('<textarea');
  });

  it('names the seller when the seller room has exactly one', async () => {
    posting.block = null;
    sellerRoom.members = [{ name: 'Walt Brennan' }];

    const markup = renderToStaticMarkup(
      await CounselThreadSection({ dealId: 'deal-1' }),
    );

    for (const card of cards(markup)) {
      expect(card).toContain('Walt Brennan (the seller) cannot see this.');
    }
  });

  it('says only the seller when the seller room has several sellers', async () => {
    posting.block = null;
    sellerRoom.members = [{ name: 'Walt Brennan' }, { name: 'Wanda Brennan' }];

    const markup = renderToStaticMarkup(
      await CounselThreadSection({ dealId: 'deal-1' }),
    );

    for (const card of cards(markup)) {
      expect(card).toContain('The seller cannot see this.');
      expect(card).not.toContain('Walt Brennan');
    }
  });
});
