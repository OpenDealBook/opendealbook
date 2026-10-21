import { isValidElement, type ReactElement, type ReactNode } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LenderRoomSummary } from '../members/entry-rules';

const server = vi.hoisted(() => ({ faqRequests: [] as unknown[] }));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => 'client',
}));
vi.mock('../faq/queries', () => ({
  fetchRoomFaq: async (...input: unknown[]) => {
    server.faqRequests.push(input);

    return [{ id: 'entry-1' }];
  },
}));
vi.mock('../contents/last-visit', () => ({
  getLastRoomVisit: async () => '2026-10-10T12:00:00.000Z',
}));
vi.mock('./faq-browser', () => ({ FaqBrowser: () => null }));

import { FaqBrowser } from './faq-browser';
import { FaqPage } from './faq-page';

const ROOM: LenderRoomSummary = {
  id: '7d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11',
  deal_id: '0a2c7b8e-41d7-4b4e-8f39-6b2f7a0a2b22',
  name: 'First Harbor Bank',
  welcome_note: null,
  expires_at: null,
  is_open: true,
  private_folder_id: 'own',
  master_folder_id: 'package',
  brand_name: null,
  brand_logo_path: null,
  deal_name: 'Dockside',
  target_close_date: null,
  must_close_by: null,
  must_close_reason: null,
  buyer_team: null,
  loan_amount: null,
  loan_type: null,
  term_years: null,
  seller_note_amount: null,
};

function find(
  node: ReactNode,
  matches: (element: ReactElement) => boolean,
): ReactElement[] {
  if (Array.isArray(node)) {
    return node.flatMap((child) => find(child, matches));
  }

  if (!isValidElement(node)) {
    return [];
  }

  const props = node.props as { children?: ReactNode };

  return [...(matches(node) ? [node] : []), ...find(props.children, matches)];
}

describe('FaqPage', () => {
  beforeEach(() => {
    server.faqRequests = [];
  });

  it("hands the browser the room's whole FAQ and the last visit", async () => {
    const page = await FaqPage({ room: ROOM });
    const [browser] = find(page, (element) => element.type === FaqBrowser);

    expect(server.faqRequests).toEqual([['client', ROOM.id]]);
    expect(browser!.props).toEqual({
      roomId: ROOM.id,
      entries: [{ id: 'entry-1' }],
      since: '2026-10-10T12:00:00.000Z',
    });
  });

  it('links back to the room, named for the deal', async () => {
    const page = await FaqPage({ room: ROOM });
    const backLinks = find(
      page,
      (element) =>
        (element.props as { href?: string }).href === `/lender/${ROOM.id}`,
    );

    expect(backLinks).toHaveLength(1);
    expect(
      (backLinks[0]!.props as { children: ReactNode[] }).children.filter(
        (child) => typeof child === 'string',
      ),
    ).toEqual(['Dockside']);
  });
});
