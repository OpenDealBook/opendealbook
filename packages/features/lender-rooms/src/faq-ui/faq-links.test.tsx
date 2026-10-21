// @vitest-environment jsdom
import '../requests-ui/test-support/mocks';
import { isValidElement, type ReactNode } from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { RoomPage } from '../browser/room-page';
import type { LenderRoomSummary } from '../members/entry-rules';
import { RequestsPage } from '../requests-ui/requests-page';
import { clearScreen, show } from '../requests-ui/test-support/screen';

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-ana' } } }) },
  }),
}));
vi.mock('../contents/last-visit', () => ({
  getLastRoomVisit: async () => null,
}));
vi.mock('../contents/load-listing', () => ({
  loadRoomListing: async () => ({
    viewer: 'lender',
    master: { id: 'package', name: 'package', folders: [], entries: [] },
    private: { id: 'own', name: 'own', folders: [], entries: [] },
  }),
}));
vi.mock('../browser/room-contact', () => ({
  loadRoomContact: async () => ({
    name: null,
    photoUrl: null,
    email: 'owner@dockside.test',
    phone: null,
  }),
}));
vi.mock('../members/actions', () => ({
  listLenderMembers: async () => ({ ok: true, value: [] }),
}));
vi.mock('../requests-ui/open-requests-summary', () => ({
  OpenRequestsSummary: () => null,
}));
vi.mock('../room-browser/room-browser', () => ({ RoomBrowser: () => null }));

const ROOM: LenderRoomSummary = {
  id: '7d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11',
  deal_id: '0a2c7b8e-41d7-4b4e-8f39-6b2f7a0a2b22',
  name: 'First Harbor Bank',
  welcome_note: null,
  expires_at: null,
  is_open: true,
  private_folder_id: '0a2c7b8e-41d7-4b4e-8f39-6b2f7a0a2b23',
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

const FAQ_PATH = `/lender/${ROOM.id}/faq`;

function hrefs(node: ReactNode): string[] {
  if (Array.isArray(node)) {
    return node.flatMap(hrefs);
  }

  if (!isValidElement(node)) {
    return [];
  }

  const props = node.props as { href?: unknown; children?: ReactNode };

  return [
    ...(typeof props.href === 'string' ? [props.href] : []),
    ...hrefs(props.children),
  ];
}

afterEach(clearScreen);

describe('links to the FAQ', () => {
  it('are on the room page', async () => {
    expect(hrefs(await RoomPage({ room: ROOM, question: null }))).toContain(FAQ_PATH);
  });

  it('are on the requests page', () => {
    show(
      <RequestsPage
        room={ROOM}
        asks={[]}
        forms={[]}
        canAct
        esignAvailable
        contactName={null}
      />,
    );

    expect(
      [...document.querySelectorAll('a')].map((link) =>
        link.getAttribute('href'),
      ),
    ).toContain(FAQ_PATH);
  });
});
