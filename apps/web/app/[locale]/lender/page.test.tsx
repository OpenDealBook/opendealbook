import type { ReactElement, ReactNode } from 'react';

import { describe, expect, it, vi } from 'vitest';

const prompts = vi.hoisted(() => ({ phone: false }));

const rpcResults = vi.hoisted(() => ({
  my_lender_room_list: [
    {
      room: {
        id: 'lender-open',
        is_open: true,
        name: 'Cedar Valley Bank',
        deal_name: 'Project Harbor',
        buyer_team: 'Harbor Acquisitions',
        loan_amount: 2240000,
        loan_type: 'sba_7a',
        term_years: 10,
        seller_note_amount: null,
        must_close_by: '2027-03-31',
        target_close_date: null,
      },
      new_count: 3,
      your_turn_count: 1,
    },
    {
      room: {
        id: 'lender-closed',
        is_open: false,
        name: 'Cedar Valley Bank',
        deal_name: 'Dockside Cafe',
        buyer_team: 'Bayside Partners',
        loan_amount: null,
        loan_type: null,
        term_years: null,
        seller_note_amount: null,
        must_close_by: null,
        target_close_date: null,
      },
      new_count: 0,
      your_turn_count: 0,
    },
  ],
  my_seller_rooms: [
    { id: 'seller-open', is_open: true },
    { id: 'seller-closed', is_open: false },
  ],
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: 'user-1', email: 'u@test' } },
      }),
    },
    rpc: (name: keyof typeof rpcResults) => ({
      throwOnError: async () => ({ data: rpcResults[name] }),
    }),
  }),
}));
vi.mock('@odb/lender-rooms/members/room-gate.ts', () => ({
  isSignedIn: async () => true,
}));
vi.mock('@odb/lender-rooms/members/person-name.ts', () => ({
  shouldAskLenderName: async () => false,
  shouldAskLenderPhone: async () => prompts.phone,
  lenderNames: async () => new Map([['user-1', 'Lee Lender']]),
}));
vi.mock('@odb/lender-rooms/members/lender-name-form.tsx', () => ({
  LenderNameForm: () => null,
}));
vi.mock('@odb/lender-rooms/browser/purge-unfinished-uploads.tsx', () => ({
  PurgeUnfinishedUploads: () => null,
}));
vi.mock('../_components/phone-prompt', () => ({ PhonePrompt: () => null }));

import { PurgeUnfinishedUploads } from '@odb/lender-rooms/browser/purge-unfinished-uploads.tsx';

import { PhonePrompt } from '../_components/phone-prompt';

import { renderToStaticMarkup } from 'react-dom/server';

import LenderRoomsPage from './page';

const noSearch = { searchParams: Promise.resolve({}) };

async function pageText(q?: string) {
  const page = await LenderRoomsPage({
    searchParams: Promise.resolve(q === undefined ? {} : { q }),
  });

  return renderToStaticMarkup(page).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

function find(
  node: ReactNode,
  match: (element: ReactElement) => boolean,
): ReactElement[] {
  if (!node || typeof node !== 'object') {
    return [];
  }

  if (Array.isArray(node)) {
    return node.flatMap((child) => find(child, match));
  }

  const element = node as ReactElement<{ children?: ReactNode }>;

  return [
    ...(match(element) ? [element] : []),
    ...find(element.props?.children, match),
  ];
}

describe('the lender rooms page', () => {
  it('keeps unfinished uploads for the open seller rooms as well as the open lender rooms', async () => {
    const page = await LenderRoomsPage(noSearch);
    const [purge] = find(
      page,
      (element) => element.type === PurgeUnfinishedUploads,
    );

    expect(
      (purge!.props as { openRoomIds: string[] }).openRoomIds.sort(),
    ).toEqual(['lender-open', 'seller-open']);
  });

  it('titles each room by the deal and buyer team, with the loan ask, close-by date, status and counts', async () => {
    const text = await pageText();

    expect(text).toContain('Project Harbor');
    expect(text).toContain('Harbor Acquisitions');
    expect(text).toContain('$2,240,000 SBA 7(a), 10-year term');
    expect(text).toContain('Close by March 31, 2027');
    expect(text).toContain('3 new since your last visit');
    expect(text).toContain('1 answered, your turn');
    expect(text).toContain('Open');
    expect(text).toContain('Closed');
    expect(text.indexOf('Project Harbor')).toBeLessThan(
      text.indexOf('Dockside Cafe'),
    );
  });

  it('finds rooms by deal, buyer team or bank', async () => {
    const byTeam = await pageText('bayside');

    expect(byTeam).toContain('Dockside Cafe');
    expect(byTeam).not.toContain('Project Harbor');

    expect(await pageText('harbor')).not.toContain('Dockside Cafe');
    expect(await pageText('cedar valley')).toContain('Dockside Cafe');
    expect(await pageText('nothing like it')).toContain(
      'No rooms match nothing like it',
    );
  });

  it('asks a lender who was never asked for a phone, once, before the rooms list', async () => {
    prompts.phone = true;

    try {
      const page = await LenderRoomsPage(noSearch);

      expect(find(page, (element) => element.type === PhonePrompt)).toHaveLength(1);
      expect(
        find(page, (element) => element.type === PurgeUnfinishedUploads),
      ).toHaveLength(0);
    } finally {
      prompts.phone = false;
    }
  });
});
