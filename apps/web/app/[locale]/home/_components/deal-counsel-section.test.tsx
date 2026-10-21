// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const loaded = vi.hoisted(() => ({
  dealIds: [] as string[],
  refusal: null as string | null,
}));

vi.mock('@odb/seller-rooms/members/people.ts', () => ({
  managersOnlyRefusal: async () => loaded.refusal,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({}),
  getSupabaseServerAdminClient: () => ({}),
}));

vi.mock('@odb/deal-counsel/documents.ts', () => ({
  loadCounselActivity: async (
    _client: unknown,
    _admin: unknown,
    dealId: string,
  ) => {
    loaded.dealIds.push(dealId);

    return [
      {
        id: 'a1',
        action: 'document_downloaded',
        person: 'Bea Buyerlaw',
        file: 'returns.pdf',
        at: '2026-10-16T10:00:00Z',
      },
    ];
  },
}));

vi.mock('@odb/deal-counsel/invite-buyer-counsel.ts', () => ({
  inviteBuyerCounsel: async () => ({ ok: true, value: undefined }),
}));

import { DealCounselSection } from './deal-counsel-section';

describe('DealCounselSection', () => {
  it("offers the invite and lists what this deal's buyer's counsel opened", async () => {
    const page = new DOMParser().parseFromString(
      renderToStaticMarkup(await DealCounselSection({ dealId: 'deal-1' })),
      'text/html',
    );

    expect(loaded.dealIds).toEqual(['deal-1']);
    expect(
      [...page.querySelectorAll('button')].map((button) => button.textContent),
    ).toContain("Invite buyer's counsel");
    expect(
      [...page.querySelectorAll('tbody td')]
        .slice(0, 3)
        .map((cell) => cell.textContent),
    ).toEqual(['Bea Buyerlaw', 'Downloaded', 'returns.pdf']);
  });

  it('disables the invite and says why for someone who cannot invite counsel', async () => {
    loaded.refusal = 'Only deal managers can invite counsel. Ask Morgan Reyes.';
    const page = new DOMParser().parseFromString(
      renderToStaticMarkup(await DealCounselSection({ dealId: 'deal-1' })),
      'text/html',
    );

    expect(
      [...page.querySelectorAll('button')].find(
        (button) => button.textContent === "Invite buyer's counsel",
      )?.disabled,
    ).toBe(true);
    expect(page.body.textContent).toContain(
      'Only deal managers can invite counsel. Ask Morgan Reyes.',
    );
  });
});
